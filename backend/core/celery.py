import os
from celery import Celery
from celery.schedules import crontab

# Broker architecture (see core/settings.py):
#   CELERY_BROKER_URL       RabbitMQ — the task queue the worker consumes from.
#   CELERY_RESULT_BACKEND   RabbitMQ RPC transport (rpc://) — task result/status.
#   CHANNEL_LAYERS          RabbitMQ — WebSocket pub/sub fan-out to browser clients.
# All message brokering runs on RabbitMQ. Redis is reserved for caching /
# rate-limiting only (projects/cache.py, DRF throttles) and is never a broker.

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")

app = Celery("jcn")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

# Scheduled tasks — requires a `celery -A core beat` process running alongside
# the worker (see docker-compose.yml's `celery-beat` service).
app.conf.beat_schedule = {
    "check-expiring-documents-daily": {
        "task": "hr.tasks.check_expiring_documents",
        "schedule": crontab(hour=6, minute=0),
    },
}
