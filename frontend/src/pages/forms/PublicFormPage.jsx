import { useState } from "react";
import { Loader } from "@/components/ui/Loader";
import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { CheckCircle } from "lucide-react";

export default function PublicFormPage() {
  const { formToken } = useParams();
  const [answers, setAnswers] = useState({});
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  const {
    data: form,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["public-form", formToken],
    queryFn: () => api.get(`/api/forms/${formToken}/`).then((r) => r.data),
  });

  const submit = useMutation({
    mutationFn: (payload) =>
      api.post(`/api/forms/${formToken}/submit/`, payload).then((r) => r.data),
    onSuccess: () => setSubmitted(true),
    onError: () => setError("Something went wrong. Please try again."),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setError(null);

    // Validate required fields
    for (const field of form.fields || []) {
      if (field.is_required && !answers[field.id]?.toString().trim()) {
        setError(`"${field.label}" is required.`);
        return;
      }
    }
    submit.mutate({ answers, email });
  };

  if (isLoading)
    return <Loader size="lg" className="min-h-screen bg-background" />;

  if (isError || !form) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-sm">
          <p className="text-lg font-semibold">Form not found</p>
          <p className="text-sm text-muted-foreground mt-1">
            This form may be inactive or the link is invalid.
          </p>
        </div>
      </div>
    );
  }

  if (submitted) {
    const successMsg =
      form.config?.success_message ||
      "Your response has been submitted. Thank you!";
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-sm">
          <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
          <p className="text-lg font-semibold">Submitted!</p>
          <p className="text-sm text-muted-foreground mt-1">{successMsg}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-start justify-center py-12 px-4">
      <div className="w-full max-w-xl">
        {/* Form header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold">{form.name}</h1>
          {form.description && (
            <p className="text-muted-foreground mt-1.5 text-sm">
              {form.description}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Submitter email — optional */}
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Your email (optional)
            </label>
            <input
              type="email"
              className="w-full border rounded-lg px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          
          <div className="h-0.5 w-full bg-border" />

          {(form.fields || []).map((field) => (
            <div key={field.id}>
              <label className="block text-sm font-medium mb-1.5">
                {field.label}
                {field.is_required && (
                  <span className="text-red-500 ml-0.5">*</span>
                )}
              </label>
              <FieldInput
                field={field}
                value={answers[field.id] ?? ""}
                onChange={(val) =>
                  setAnswers((prev) => ({ ...prev, [field.id]: val }))
                }
              />
              {field.placeholder && !answers[field.id] && (
                <p className="text-xs text-muted-foreground mt-1">
                  {field.placeholder}
                </p>
              )}
            </div>
          ))}

          {error && (
            <p className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={submit.isPending}>
            {submit.isPending ? "Submitting…" : "Submit"}
          </Button>
        </form>
      </div>
    </div>
  );
}

// A helper to render different input types based on the field configuration
function FieldInput({ field, value, onChange }) {
  const base =
    "w-full border rounded-lg px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors";

  switch (field.field_type) {
    case "long_text":
      return (
        <textarea
          className={`${base} resize-none`}
          rows={4}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "dropdown":
      return (
        <select
          className={base}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Select…</option>
          {(field.options || []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );

    case "multiselect":
      return (
        <div className="space-y-1.5">
          {(field.options || []).map((opt) => {
            const selected = Array.isArray(value) ? value : [];
            return (
              <label
                key={opt}
                className="flex items-center gap-2 text-sm cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...selected, opt]
                      : selected.filter((v) => v !== opt);
                    onChange(next);
                  }}
                  className="rounded"
                />
                {opt}
              </label>
            );
          })}
        </div>
      );

    case "date":
      return (
        <input
          type="date"
          className={base}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "number":
      return (
        <input
          type="number"
          className={base}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "email":
      return (
        <input
          type="email"
          className={base}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    default:
      return (
        <input
          type="text"
          className={base}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}
