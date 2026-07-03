"""
Integration notification services.

Formats and dispatches outbound messages to Teams and Google Chat.
Entry point: fanout_notification(), invoked by the Celery task
integrations.tasks.send_chat_notification — which is queued via
core.events.broadcast() (the "chat" surface of the EVENTS registry).

Cards are GENERIC — they render a `resource` dict, so any app can post to
chat without this file changing:

    resource = {
        "title":    "Fix login redirect",          # required
        "subtitle": "Platform board",              # optional (header line)
        "facts":    {"Priority": "🟠 High"},       # optional key→value rows
        "url":      "https://…",                   # optional "Open in JCN" button
    }

Verb strings and their labels live in core.events.NOTIFICATION_VERBS —
nothing event-related is defined here, only payload formatting + HTTP dispatch.
"""
import logging

import requests
from django.db import models

from core.events import verb_label

logger = logging.getLogger(__name__)


# ── Message formatters ────────────────────────────────────────────────────────
def format_teams_card(verb, resource, actor):
    """Returns a Teams MessageCard dict (legacy connector card — no Power Apps needed)."""
    label = verb_label(verb)
    actor_name = actor.full_name or actor.email.split("@")[0]
    facts = [{"name": k, "value": str(v)} for k, v in (resource.get("facts") or {}).items()]
    facts.append({"name": "By", "value": actor_name})

    card = {
        "@type":      "MessageCard",
        "@context":   "https://schema.org/extensions",
        "themeColor": "6366f1",
        "summary":    f"{label}: {resource['title']}",
        "sections": [
            {
                "activityTitle":    f"**{label}**",
                "activitySubtitle": resource["title"],
                "activityText":     resource.get("subtitle", ""),
                "facts": facts,
            }
        ],
    }
    if resource.get("url"):
        card["potentialAction"] = [
            {
                "@type": "OpenUri",
                "name":  "Open in JCN",
                "targets": [{"os": "default", "uri": resource["url"]}],
            }
        ]
    return card


def format_google_chat_card(verb, resource, actor):
    """Returns a Google Chat card payload."""
    label = verb_label(verb)
    actor_name = actor.full_name or actor.email.split("@")[0]

    widgets = [{"textParagraph": {"text": f"<b>{resource['title']}</b>"}}]
    for key, value in (resource.get("facts") or {}).items():
        widgets.append({"decoratedText": {"topLabel": key, "text": str(value)}})
    widgets.append({"decoratedText": {"topLabel": "By", "text": actor_name}})

    sections = [{"widgets": widgets}]
    if resource.get("url"):
        sections.append({
            "widgets": [
                {
                    "buttonList": {
                        "buttons": [
                            {
                                "text": "Open in JCN",
                                "onClick": {"openLink": {"url": resource["url"]}},
                                "color": {"red": 0.388, "green": 0.4, "blue": 0.945, "alpha": 1},
                            }
                        ]
                    }
                }
            ]
        })

    return {
        "cardsV2": [
            {
                "cardId": f"jcn-{verb}",
                "card": {
                    "header": {
                        "title":    label,
                        "subtitle": resource.get("subtitle", ""),
                        "imageUrl": "https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsoutlined/task/default/48px.svg",
                        "imageType": "CIRCLE",
                    },
                    "sections": sections,
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
def fanout_notification(workspace, verb, actor, resource, board=None):
    """
    Fan a workspace event out to all active mapped integration channels.

    board: pass the Board for task-scoped events — board-mapped channels only
    receive events for their board. Workspace-level events (org, HR) go to
    workspace-wide mappings (board is NULL) only.
    Failures are caught and logged — never raises.
    """
    try:
        _fanout(workspace, verb, actor, resource, board)
    except Exception as exc:
        logger.exception("fanout_notification uncaught error: %s", exc)


def _fanout(workspace, verb, actor, resource, board):
    from integrations.models import IntegrationChannelMapping, TeamsIntegration, GoogleChatIntegration

    board_q = models.Q(board__isnull=True)
    if board is not None:
        board_q |= models.Q(board=board)

    mappings = IntegrationChannelMapping.objects.filter(
        workspace=workspace,
        is_active=True,
    ).filter(board_q).select_related("board")

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
            send_teams(webhook, format_teams_card(verb, resource, actor))

        elif mapping.platform == IntegrationChannelMapping.Platform.GOOGLE_CHAT:
            webhook = mapping.webhook_url
            if not webhook:
                try:
                    webhook = workspace.google_chat_integration.webhook_url
                except GoogleChatIntegration.DoesNotExist:
                    continue
            if not webhook:
                continue
            send_google_chat(webhook, format_google_chat_card(verb, resource, actor))
