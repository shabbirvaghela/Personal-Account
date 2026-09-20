import { useEffect, useState } from "react";
import { getOfficeAddress, setOfficeAddress, getPetrolRate, setPetrolRate, DEFAULT_PETROL_RATE } from "../settings/settings";

export function SettingsPage() {
  const [address, setAddress] = useState("");
  const [rate, setRate] = useState(DEFAULT_PETROL_RATE);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getOfficeAddress().then(setAddress);
    getPetrolRate().then(setRate);
  }, []);

  async function onSave() {
    await setOfficeAddress(address.trim());
    await setPetrolRate(Number(rate) || DEFAULT_PETROL_RATE);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Settings</h2>
      </div>

      <div className="quick-add">
        <label className="settings-label">Office address</label>
        <p className="muted" style={{ marginTop: -4 }}>
          Used as the default "from" location for the petrol expense calculator.
        </p>
        <input
          className="settings-input"
          placeholder="e.g. Shop no. 4, Court Road, Ahmedabad"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />

        <label className="settings-label" style={{ marginTop: 14 }}>Petrol cost per km (₹)</label>
        <input
          className="settings-input"
          type="number"
          step="0.5"
          value={rate}
          onChange={(e) => setRate(Number(e.target.value))}
        />

        <button style={{ marginTop: 14 }} onClick={onSave}>
          {saved ? "Saved ✓" : "Save settings"}
        </button>
      </div>
      <p className="muted">These settings are stored on this device.</p>
    </div>
  );
}
