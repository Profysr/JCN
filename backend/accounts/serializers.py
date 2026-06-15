from rest_framework import serializers
from dj_rest_auth.registration.serializers import RegisterSerializer as BaseRegisterSerializer
from .models import User, UserProfile
from core.fields import PrefixedUUIDField


class RegisterSerializer(BaseRegisterSerializer):
    full_name = serializers.CharField(max_length=255, required=False, allow_blank=True)
    username = None

    def get_cleaned_data(self):
        data = super().get_cleaned_data()
        data["full_name"] = self.validated_data.get("full_name", "")
        return data

    def save(self, request):
        user = super().save(request)
        user.full_name = self.cleaned_data.get("full_name", "")
        user.save()
        return user


class MiniUserSerializer(serializers.ModelSerializer):
    """Minimal read-only user representation for embedding in other serializers."""

    id = PrefixedUUIDField(read_only=True)

    class Meta:
        model = User
        fields = ["id", "email", "full_name"]
        read_only_fields = ["email"]


class UserSerializer(serializers.ModelSerializer):
    id = PrefixedUUIDField(read_only=True)
    # Profile fields kept flat so the API surface stays consistent for the frontend.
    theme = serializers.CharField(source="profile.theme", required=False)
    accent_color = serializers.CharField(source="profile.accent_color", required=False)
    density_mode = serializers.CharField(source="profile.density_mode", required=False)

    class Meta:
        model = User
        fields = [
            "id", "email", "full_name", "avatar",
            "theme", "accent_color", "density_mode",
            "can_create_workspace", "created_at",
        ]
        read_only_fields = ["email", "created_at"]

    def update(self, instance, validated_data):
        profile_data = validated_data.pop("profile", {})

        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        instance.save()

        if profile_data:
            profile, _ = UserProfile.objects.get_or_create(user=instance)
            for attr, val in profile_data.items():
                setattr(profile, attr, val)
            profile.save()

        return instance
