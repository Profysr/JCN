"""
WSGI entry point — used by Gunicorn to serve plain HTTP/REST traffic.

Django Channels needs ASGI (core/asgi.py) for the WebSocket consumer, but every
DRF view in this project is a regular synchronous view with no need for the
async request path. Routing that traffic through ASGI forces it onto asgiref's
single thread_sensitive worker thread, which serializes ALL concurrent REST
requests (and the WebSocket consumer's own DB calls) onto one thread process-wide.

So in production: Gunicorn (this file) serves everything under /api/, and a
separate Daphne process (core/asgi.py) serves only /ws/ — see docker-compose.yml
and nginx.conf for the routing split.
"""

import os
from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")

application = get_wsgi_application()
