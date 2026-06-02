from rest_framework import serializers
from dj_rest_auth.registration.serializers import RegisterSerializer as BaseRegisterSerializer
from .models import User


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


class UserSerializer(serializers.ModelSerializer):
    display_name = serializers.ReadOnlyField()

    class Meta:
        model = User
        fields = [
            "id", "email", "full_name", "display_name", "avatar",
            "theme", "accent_color", "density_mode",
            "can_create_workspace", "created_at",
        ]
        read_only_fields = ["id", "email", "created_at"]
