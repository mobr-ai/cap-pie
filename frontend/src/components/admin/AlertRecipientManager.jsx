export default function AlertRecipientsManager({ recipients, onChange }) {
  const [input, setInput] = useState("");

  const addRecipient = () => {
    const email = input.trim().toLowerCase();
    if (!email) return;
    if (recipients.includes(email)) return;
    onChange([...recipients, email]);
    setInput("");
  };

  return (
    <div className="admin-card">
      <h3>Alert recipients</h3>
      <p className="admin-card-subtitle">
        Manage shared email addresses used across alert notifications.
      </p>

      <div className="recipient-input-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="add e-mail address"
        />
        <button onClick={addRecipient}>Add</button>
      </div>

      <div className="recipient-chips">
        {recipients.map((email) => (
          <span key={email} className="chip">
            {email}
            <button
              onClick={() => onChange(recipients.filter((r) => r !== email))}
            >
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
