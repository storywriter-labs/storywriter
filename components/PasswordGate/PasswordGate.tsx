// PasswordGate.jsx
import { useState } from 'react';

const PASSWORD = '48Crash';

export default function PasswordGate({ children }: { children: React.ReactNode }) {
    const [unlocked, setUnlocked] = useState(
        () => localStorage.getItem('gate') === '1'
    );
    const [input, setInput] = useState('');
    const [error, setError] = useState(false);

    if (unlocked) return children;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 12 }}>
            <h2>Storywriter</h2>
            <input
                type="password"
                placeholder="Password"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && check()}
            />
            {error && <p style={{ color: 'red' }}>Wrong password</p>}
            <button onClick={check}>Enter</button>
        </div>
    );

    function check() {
        if (input === PASSWORD) {
            localStorage.setItem('gate', '1');
            setUnlocked(true);
        } else {
            setError(true);
        }
    }
}