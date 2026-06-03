import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

const StoryReaderHeader: React.FC = () => {
    const navigation = useNavigation();

    return (
        <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Back">
                <Text style={styles.headerButton}>← Back</Text>
            </TouchableOpacity>

            <Text style={styles.headerTitle}>Story</Text>

            <TouchableOpacity onPress={() => {/* show menu */ }} accessibilityLabel="Open menu">
                <Ionicons name="menu" size={24} color="#007AFF" />
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        backgroundColor: 'white',
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '600',
    },
    headerButton: {
        fontSize: 20,
        color: '#007AFF',
    },
});

export default StoryReaderHeader; 