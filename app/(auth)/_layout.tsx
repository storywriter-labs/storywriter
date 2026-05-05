import { Stack } from 'expo-router';
import PasswordGate from '../../components/PasswordGate/PasswordGate';

export default function AuthLayout() {
    return (
        <PasswordGate>
            <Stack>
                <Stack.Screen
                    name="login"
                    options={{
                        headerShown: false, // Hides the "Back" button and title bar on login
                        title: "Sign In"
                    }}
                />
            </Stack>
        </PasswordGate>

    );
}