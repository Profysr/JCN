import uuid
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin, BaseUserManager
from django.db import models


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("Email is required")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    THEME_CHOICES = [("light", "Light"), ("dark", "Dark"), ("midnight", "Midnight")]
    ACCENT_CHOICES = [
        ("indigo", "Indigo"), ("blue", "Blue"), ("violet", "Violet"),
        ("pink", "Pink"), ("rose", "Rose"), ("amber", "Amber"),
        ("emerald", "Emerald"), ("cyan", "Cyan"), ("slate", "Slate"),
    ]
    DENSITY_CHOICES = [("comfortable", "Comfortable"), ("compact", "Compact"), ("cozy", "Cozy")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=255, blank=True)
    avatar = models.ImageField(upload_to="avatars/", null=True, blank=True)
    theme = models.CharField(max_length=16, choices=THEME_CHOICES, default="light")
    accent_color = models.CharField(max_length=16, choices=ACCENT_CHOICES, default="indigo")
    density_mode = models.CharField(max_length=16, choices=DENSITY_CHOICES, default="comfortable")
    # Controls whether this user can create new workspaces.
    # Workspace admins have True; users who joined via invite get False.
    can_create_workspace = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = UserManager()

    def __str__(self):
        return self.email

    @property
    def display_name(self):
        return self.full_name or self.email.split("@")[0]
