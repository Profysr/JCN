import os
from celery import Celery

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
