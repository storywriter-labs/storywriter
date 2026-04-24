import { StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';

export const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
    },
    playPauseButton: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: Colors.accent,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 4,
    },
    playPauseIcon: {
        fontSize: 28,
        color: Colors.white,
    },
    errorContainer: {
        backgroundColor: Colors.errorLight,
        padding: 12,
        borderRadius: 8,
        borderLeftWidth: 4,
        borderLeftColor: Colors.error,
        gap: 10,
        maxWidth: 200,
    },
    errorText: {
        fontSize: 13,
        color: Colors.error,
        textAlign: 'center',
        lineHeight: 18,
    },
    retryButton: {
        backgroundColor: Colors.accent,
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 8,
        alignSelf: 'center',
        minHeight: 44,
        minWidth: 100,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.15,
        shadowRadius: 2,
        elevation: 2,
    },
    retryButtonText: {
        fontSize: 14,
        color: Colors.white,
        fontWeight: '600',
    },
});
