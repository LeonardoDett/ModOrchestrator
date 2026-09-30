import { Copy } from "lucide-react";
import { Alert, Button, Inline, Stack, Typography, useToast } from "dettmann-ui";
import { errorMessage, type UIError } from "../../bridge/errors";
import { useI18n, type MessageKey } from "../../i18n/i18n";

/** Copies text and reports the result with a transient toast. */
export function useCopy() {
  const { t } = useI18n();
  const { addToast } = useToast();
  return async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      addToast({ title: t("common.copied"), variant: "success", duration: 2500 });
    } catch {
      addToast({ title: t("common.copyFailed"), variant: "danger" });
    }
  };
}

interface ErrorAlertProps {
  title: MessageKey;
  error: UIError;
  onRetry?: () => void;
}

/** Human title (i18n by code) + copyable technical details (ui/03 §4). */
export function ErrorAlert({ title, error, onRetry }: ErrorAlertProps) {
  const i18n = useI18n();
  const copy = useCopy();
  return (
    <Alert.Root variant="danger">
      <Alert.Title>{i18n.t(title)}</Alert.Title>
      <Alert.Description>
        <Stack gap="sm">
          <span>{errorMessage(i18n, error)}</span>
          {error.detail ? <TechnicalDetails text={error.detail} /> : null}
          {onRetry || error.detail ? (
            <Inline gap="sm">
              {onRetry ? (
                <Button size="sm" variant="outline" onClick={onRetry}>
                  {i18n.t("common.retry")}
                </Button>
              ) : null}
              {error.detail ? (
                <Button size="sm" variant="ghost" startIcon={<Copy aria-hidden="true" className="h-4 w-4" />} onClick={() => copy(error.detail!)}>
                  {i18n.t("common.copy")}
                </Button>
              ) : null}
            </Inline>
          ) : null}
        </Stack>
      </Alert.Description>
    </Alert.Root>
  );
}

export function TechnicalDetails({ text }: { text: string }) {
  const { t } = useI18n();
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-fg-muted">{t("common.details")}</summary>
      <Typography variant="code" className="mt-1 block whitespace-pre-wrap break-all rounded-md bg-sunken p-2 text-xs">
        {text}
      </Typography>
    </details>
  );
}
