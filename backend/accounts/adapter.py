import logging

from allauth.account.adapter import DefaultAccountAdapter
from allauth.socialaccount.adapter import DefaultSocialAccountAdapter
from django.conf import settings

from core.emails import send_email

logger = logging.getLogger(__name__)


class CustomAccountAdapter(DefaultAccountAdapter):
    """
    Overrides allauth email sending to use Resend directly with branded HTML templates.
    Also overrides the email confirmation URL to point at the React frontend.
    """

    def send_mail(self, template_prefix, email, context):
        if template_prefix == "account/email/password_reset_key":
            self._send_password_reset(email, context)
        elif template_prefix in (
            "account/email/email_confirmation",
            "account/email/email_confirmation_signup",
        ):
            self._send_email_verification(email, context)
        else:
            # Fallback: let allauth handle any other system emails via Django's
            # email framework (e.g. account_already_exists). These are rare and
            # only fire in edge cases, so default behavior is fine.
            super().send_mail(template_prefix, email, context)

    def get_email_confirmation_url(self, request, emailconfirmation):
        key = emailconfirmation.key
        return f"{settings.FRONTEND_URL}/verify-email/{key}"

    # ── private helpers ────────────────────────────────────────────────────────
    def _send_password_reset(self, email, context):
        send_email(
            to=[email],
            subject="Reset your JCN password",
            app="accounts",
            template="password_reset.html",
            context={
                "email": email,
                "reset_url": context.get("password_reset_url", ""),
            },
        )

    def _send_email_verification(self, email, context):
        send_email(
            to=[email],
            subject="Confirm your JCN email address",
            app="accounts",
            template="email_verification.html",
            context={
                "email": email,
                "confirm_url": context.get("activate_url", ""),
            },
        )


class CustomSocialAccountAdapter(DefaultSocialAccountAdapter):
    def save_user(self, request, sociallogin, form=None):
        user = super().save_user(request, sociallogin, form)
        extra_data = sociallogin.account.extra_data
        picture = extra_data.get("picture")
        # Only set on first Google login; don't overwrite if user changed avatar later.
        if picture and not user.avatar:
            user.avatar = picture
            user.avatar_type = "google"
            user.save(update_fields=["avatar", "avatar_type"])
        return user
