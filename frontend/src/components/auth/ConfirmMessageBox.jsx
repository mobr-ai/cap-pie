import Image from "react-bootstrap/Image";
import Container from "react-bootstrap/Container";
import Button from "react-bootstrap/Button";

export default function ConfirmMessageBox({
  t,
  resendLoading,
  onResendConfirmation,
}) {
  return (
    <Container className="Auth-container confirm-message-box">
      <Image className="Auth-logo" src="./icons/logo.png" alt="CAP logo" />
      <h2 className="Auth-title">{t("confirmYourEmailTitle")}</h2>
      <p className="Auth-confirm-text">{t("confirmYourEmailMsg")}</p>
      <p className="Auth-confirm-text">{t("confirmDidNotReceive")}</p>
      <Button
        className="Auth-input-button"
        variant="dark"
        size="md"
        onClick={!resendLoading ? onResendConfirmation : null}
        disabled={resendLoading}
      >
        {resendLoading ? t("resending") : t("resendConfirmation")}
      </Button>
    </Container>
  );
}
