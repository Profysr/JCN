"""
Integration notification services.

Formats and dispatches outbound messages to Teams and Google Chat.
Called by fanout_notification() which is hooked into projects.views.notify().
"""
import logging

import requests
from django.conf import settings
from django.db import models

logger = logging.getLogger(__name__)

PRIORITY_EMOJI = {
    "urgent": "🔴",
    "high":   "🟠",
    "medium": "🟡",
    "low":    "🔵",
    "none":   "⚪",
}

VERB_LABEL = {
    "task_created":       "📋 Task Created",
    "task_assigned":      "👤 Task Assigned",
    "task_commented":     "💬 New Comment",
    "task_completed":     "✅ Task Completed",
    "task_mentioned":     "💬 You Were Mentioned",
    "sprint_started":     "🚀 Sprint Started",
    "sprint_completed":   "🏁 Sprint Completed",
    "approval_requested": "✋ Approval Requested",
}


# ── Message formatters ────────────────────────────────────────────────────────
def _task_url(workspace_id, board_id, task_id):
    frontend = getattr(settings, "FRONTEND_URL", "http://localhost:5173")
    return f"{frontend}/w/{workspace_id}/boards/{board_id}?task={task_id}"


def format_teams_card(verb, task, actor, workspace_id):
    """Returns a Teams MessageCard dict (legacy connector card — no Power Apps needed)."""
    label     = VERB_LABEL.get(verb, verb.replace("_", " ").title())
    pri_emoji = PRIORITY_EMOJI.get(getattr(task, "priority", "none"), "⚪")
    url       = _task_url(workspace_id, str(task.board_id), str(task.id))

    return {
        "@type":      "MessageCard",
        "@context":   "https://schema.org/extensions",
        "themeColor": "6366f1",
        "summary":    f"{label}: {task.title}",
        "sections": [
            {
                "activityTitle":    f"**{label}**",
                "activitySubtitle": task.title,
                "activityText":     (
                    f"**Project:** {task.board.name}  \n"
                    f"**Priority:** {pri_emoji} {(task.priority or 'none').title()}  \n"
                    f"**By:** {actor.full_name or actor.email.split('@')[0]}"
                ),
                "facts": [
                    {"name": "Project",  "value": task.board.name},
                    {"name": "Priority", "value": f"{pri_emoji} {(task.priority or 'none').title()}"},
                    {"name": "Actor",    "value": actor.full_name or actor.email.split("@")[0]},
                ],
            }
        ],
        "potentialAction": [
            {
                "@type": "OpenUri",
                "name":  "Open in JCN",
                "targets": [{"os": "default", "uri": url}],
            }
        ],
    }


def format_google_chat_card(verb, task, actor, workspace_id):
    """Returns a Google Chat card payload."""
    label     = VERB_LABEL.get(verb, verb.replace("_", " ").title())
    pri_emoji = PRIORITY_EMOJI.get(getattr(task, "priority", "none"), "⚪")
    url       = _task_url(workspace_id, str(task.board_id), str(task.id))

    return {
        "cardsV2": [
            {
                "cardId": f"jcn-{task.id}",
                "card": {
                    "header": {
                        "title":    label,
                        "subtitle": task.board.name,
                        "imageUrl": "https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsoutlined/task/default/48px.svg",
                        "imageType": "CIRCLE",
                    },
                    "sections": [
                        {
                            "widgets": [
                                {"textParagraph": {"text": f"<b>{task.title}</b>"}},
                                {
                                    "decoratedText": {
                                        "topLabel": "Priority",
                                        "text":     f"{pri_emoji} {(task.priority or 'none').title()}",
                                    }
                                },
                                {
                                    "decoratedText": {
                                        "topLabel": "By",
                                        "text":     actor.full_name or actor.email.split("@")[0],
                                    }
                                },
                            ]
                        },
                        {
                            "widgets": [
                                {
                                    "buttonList": {
                                        "buttons": [
                                            {
                                                "text": "Open in JCN",
                                                "onClick": {"openLink": {"url": url}},
                                                "color": {"red": 0.388, "green": 0.4, "blue": 0.945, "alpha": 1},
                                            }
                                        ]
                                    }
                                }
                            ]
                        },
                    ],
                },
            }
        ]
    }


# ── Senders ───────────────────────────────────────────────────────────────────
def send_teams(webhook_url, payload):
    """Posts a MessageCard to a Teams incoming webhook."""
    try:
        resp = requests.post(webhook_url, json=payload, timeout=5)
        if resp.status_code >= 400:
            logger.warning("Teams webhook returned %s", resp.status_code)
    except Exception as exc:
        logger.warning("Teams send error: %s", exc)


def send_google_chat(webhook_url, payload):
    """Posts a card to a Google Chat incoming webhook."""
    try:
        resp = requests.post(webhook_url, json=payload, timeout=5)
        if resp.status_code >= 400:
            logger.warning("Google Chat webhook returned %s", resp.status_code)
    except Exception as exc:
        logger.warning("Google Chat send error: %s", exc)


# ── Main fanout entry point ───────────────────────────────────────────────────
def fanout_notification(workspace, verb, task, actor):
    """
    Called by projects.views after every task event.
    Fans out to all active integration channels mapped to the task's project.
    Failures are caught and logged — never raises so the main request isn't broken.

    Why called from projects and not workspaces: task events (created, assigned, etc.)
    originate in the projects app. The integration layer is workspace-scoped but the
    trigger is always a task action, so projects.views is the correct call site.
    """
    try:
        _fanout(workspace, verb, task, actor)
    except Exception as exc:
        logger.exception("fanout_notification uncaught error: %s", exc)


def _fanout(workspace, verb, task, actor):
    from integrations.models import IntegrationChannelMapping, TeamsIntegration, GoogleChatIntegration

    workspace_id = str(workspace.id)

    mappings = IntegrationChannelMapping.objects.filter(
        workspace=workspace,
        is_active=True,
    ).filter(
        models.Q(board=task.board) | models.Q(board__isnull=True)
    ).select_related("board")

    if not mappings.exists():
        return

    for mapping in mappings:
        if mapping.enabled_events and verb not in mapping.enabled_events:
            continue

        if mapping.platform == IntegrationChannelMapping.Platform.TEAMS:
            webhook = mapping.webhook_url
            if not webhook:
                try:
                    webhook = workspace.teams_integration.webhook_url
                except TeamsIntegration.DoesNotExist:
                    continue
            if not webhook:
                continue
            send_teams(webhook, format_teams_card(verb, task, actor, workspace_id))

        elif mapping.platform == IntegrationChannelMapping.Platform.GOOGLE_CHAT:
            webhook = mapping.webhook_url
            if not webhook:
                try:
                    webhook = workspace.google_chat_integration.webhook_url
                except GoogleChatIntegration.DoesNotExist:
                    continue
            if not webhook:
                continue
            send_google_chat(webhook, format_google_chat_card(verb, task, actor, workspace_id))
