import Image from "react-bootstrap/Image";
import Container from "react-bootstrap/Container";

export default function AuthShell({ title, children }) {
  return (
    <Container className="Auth-container-wrapper" fluid>
      <Container className="Auth-container">
        <Image className="Auth-logo" src="./icons/logo.png" alt="CAP logo" />
        <h2 className="Auth-title">{title}</h2>
        {children}
      </Container>
    </Container>
  );
}
