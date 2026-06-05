"""
Integration notification services.

Formats and dispatches outbound messages to Slack, Teams, and Google Chat.
Called by fanout_notification() which is hooked into projects.views.notify().
"""
import logging
import requests
from django.conf import settings

logger = logging.getLogger(__name__)

PRIORITY_EMOJI = {
    "urgent": "🔴",
    "high":   "🟠",
    "medium": "🟡",
    "low":    "🔵",
    "none":   "⚪",
}

VERB_LABEL = {
    "task_created":  "📋 Task Created",
    "task_assigned": "👤 Task Assigned",
    "task_commented":"💬 New Comment",
    "task_completed":"✅ Task Completed",
    "task_mentioned":"💬 You Were Mentioned",
    "sprint_started":"🚀 Sprint Started",
    "sprint_completed": "🏁 Sprint Completed",
    "approval_requested": "✋ Approval Requested",
}


# ── Message formatters ────────────────────────────────────────────────────────

def _task_url(workspace_slug, project_id, task_id):
    frontend = getattr(settings, "FRONTEND_URL", "http://localhost:5173")
    return f"{frontend}/w/{workspace_slug}/projects/{project_id}?task={task_id}"


def format_slack_detailed(verb, task, actor, workspace_slug):
    """Returns Slack Block Kit payload (list of blocks)."""
    label    = VERB_LABEL.get(verb, verb.replace("_", " ").title())
    pri_emoji = PRIORITY_EMOJI.get(getattr(task, "priority", "none"), "⚪")
    url      = _task_url(workspace_slug, str(task.project_id), str(task.id))

    blocks = [
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*{label}*\n<{url}|{task.title}>",
            },
        },
        {
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": (
                        f"*Project:* {task.project.name}  |  "
                        f"*Priority:* {pri_emoji} {(task.priority or 'none').title()}  |  "
                        f"*By:* {actor.full_name or actor.email.split('@')[0]}"
                    ),
                }
            ],
        },
        {"type": "divider"},
    ]

    # Add "Open in JCN" action button
    blocks.append({
        "type": "actions",
        "elements": [
            {
                "type": "button",
                "text": {"type": "plain_text", "text": "Open in JCN"},
                "url": url,
                "style": "primary",
            }
        ],
    })

    return blocks


def format_slack_compact(verb, task, actor, workspace_slug):
    label    = VERB_LABEL.get(verb, verb.replace("_", " ").title())
    pri_emoji = PRIORITY_EMOJI.get(getattr(task, "priority", "none"), "⚪")
    url      = _task_url(workspace_slug, str(task.project_id), str(task.id))
    return f"{label}: <{url}|{task.title}> {pri_emoji} ({task.project.name})"


def format_teams_card(verb, task, actor, workspace_slug):
    """Returns a Teams MessageCard dict (legacy connector card — no Power Apps needed)."""
    label    = VERB_LABEL.get(verb, verb.replace("_", " ").title())
    pri_emoji = PRIORITY_EMOJI.get(getattr(task, "priority", "none"), "⚪")
    url      = _task_url(workspace_slug, str(task.project_id), str(task.id))

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
                    f"**Project:** {task.project.name}  \n"
                    f"**Priority:** {pri_emoji} {(task.priority or 'none').title()}  \n"
                    f"**By:** {actor.full_name or actor.email.split('@')[0]}"
                ),
                "facts": [
                    {"name": "Project",  "value": task.project.name},
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


def format_google_chat_card(verb, task, actor, workspace_slug):
    """Returns a Google Chat card payload."""
    label     = VERB_LABEL.get(verb, verb.replace("_", " ").title())
    pri_emoji = PRIORITY_EMOJI.get(getattr(task, "priority", "none"), "⚪")
    url       = _task_url(workspace_slug, str(task.project_id), str(task.id))

    return {
        "cardsV2": [
            {
                "cardId": f"jcn-{task.id}",
                "card": {
                    "header": {
                        "title":    label,
                        "subtitle": task.project.name,
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

def send_slack(bot_token, channel_id, blocks, fallback_text):
    """Posts a message to a Slack channel using the bot token."""
    try:
        resp = requests.post(
            "https://slack.com/api/chat.postMessage",
            headers={"Authorization": f"Bearer {bot_token}", "Content-Type": "application/json"},
            json={"channel": channel_id, "blocks": blocks, "text": fallback_text},
            timeout=5,
        )
        data = resp.json()
        if not data.get("ok"):
            logger.warning("Slack post failed: %s", data.get("error"))
    except Exception as exc:
        logger.warning("Slack send error: %s", exc)


def send_slack_webhook(webhook_url, blocks, fallback_text):
    """Posts to a Slack incoming webhook (no bot token needed)."""
    try:
        requests.post(
            webhook_url,
            json={"blocks": blocks, "text": fallback_text},
            timeout=5,
        )
    except Exception as exc:
        logger.warning("Slack webhook send error: %s", exc)


def send_teams(webhook_url, payload):
    """Posts an Adaptive Card to a Teams incoming webhook."""
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
    Called by projects.views.notify() after every task event.
    Fans out to all active integration channels mapped to the task's project.
    Failures are caught and logged — never raise so the main request isn't broken.
    """
    try:
        _fanout(workspace, verb, task, actor)
    except Exception as exc:
        logger.exception("fanout_notification uncaught error: %s", exc)


def _fanout(workspace, verb, task, actor):
    from integrations.models import IntegrationChannelMapping, SlackIntegration, TeamsIntegration, GoogleChatIntegration

    workspace_slug = workspace.slug

    # Find all active mappings for this project OR workspace-wide fallback
    mappings = IntegrationChannelMapping.objects.filter(
        workspace=workspace,
        is_active=True,
    ).filter(
        models.Q(project=task.project) | models.Q(project__isnull=True)
    ).select_related("project")

    if not mappings.exists():
        return

    for mapping in mappings:
        # Check if this event is in the enabled list (empty = all events)
        if mapping.enabled_events and verb not in mapping.enabled_events:
            continue

        fmt = mapping.notification_format

        if mapping.platform == IntegrationChannelMapping.Platform.SLACK:
            try:
                slack = workspace.slack_integration
            except SlackIntegration.DoesNotExist:
                continue
            if not slack.is_active:
                continue

            if fmt == "compact":
                text   = format_slack_compact(verb, task, actor, workspace_slug)
                blocks = [{"type": "section", "text": {"type": "mrkdwn", "text": text}}]
            else:
                blocks = format_slack_detailed(verb, task, actor, workspace_slug)

            fallback = VERB_LABEL.get(verb, verb) + ": " + task.title

            if mapping.channel_id:
                send_slack(slack.bot_token, mapping.channel_id, blocks, fallback)
            elif slack.incoming_webhook_url:
                send_slack_webhook(slack.incoming_webhook_url, blocks, fallback)

        elif mapping.platform == IntegrationChannelMapping.Platform.TEAMS:
            webhook = mapping.webhook_url
            if not webhook:
                try:
                    webhook = workspace.teams_integration.webhook_url
                except TeamsIntegration.DoesNotExist:
                    continue
            if not webhook:
                continue
            payload = format_teams_card(verb, task, actor, workspace_slug)
            send_teams(webhook, payload)

        elif mapping.platform == IntegrationChannelMapping.Platform.GOOGLE_CHAT:
            webhook = mapping.webhook_url
            if not webhook:
                try:
                    webhook = workspace.google_chat_integration.webhook_url
                except GoogleChatIntegration.DoesNotExist:
                    continue
            if not webhook:
                continue
            payload = format_google_chat_card(verb, task, actor, workspace_slug)
            send_google_chat(webhook, payload)


# Import needed for Q objects inside _fanout
from django.db import models
