import os
from celery import Celery

# Notice Redis is used twice here for two different purposes:

# Setting	Purpose
# CELERY_BROKER_URL	The task queue — Django pushes jobs here, the Celery worker reads from it
# CELERY_RESULT_BACKEND	Stores task results/status so you can check if a task succeeded
# CHANNEL_LAYERS (line 103)	WebSocket pub/sub — fans out messages to connected browser clients
# All three point to the same Redis instance (REDIS_URL), but they use completely separate Redis keys internally so they don't interfere with each other.

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")

app = Celery("jcn")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
