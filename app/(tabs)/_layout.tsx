// app/(tabs)/_layout.tsx
import { Tabs } from 'expo-router';
import React from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Colors } from '../../constants/theme';

// The root layout sets background: 'transparent' so the auth screens can use
// BackgroundImage freely.  That bleeds into tab screens on web — each inactive
// tab stays rendered and shows through the active one.  Override the background
// to an opaque colour scoped to this navigator only.
const tabTheme = {
    ...DefaultTheme,
    colors: { ...DefaultTheme.colors, background: Colors.paper },
};

export default function TabLayout() {
    return (
        <ThemeProvider value={tabTheme}>
        <Tabs
            screenOptions={{
                headerShown: false,
                tabBarStyle: {
                    backgroundColor: '#F0F8FF', // Light cyan
                    borderTopColor: Colors.yellow, // Golden yellow
                    borderTopWidth: 3,
                    paddingBottom: 8,
                    paddingTop: 8,
                    height: 70,
                },
                tabBarActiveTintColor: Colors.teal, // Turquoise
                tabBarInactiveTintColor: '#687076', // Muted gray
                tabBarLabelStyle: {
                    fontSize: 14,
                    fontWeight: '600',
                    fontFamily: 'SpaceMono',
                },
            }}
        >
            <Tabs.Screen
                name="index"
                options={{
                    title: 'The Lab',
                    tabBarIcon: ({ color, size }) => (
                        <FontAwesome name="flask" size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="bookshelf"
                options={{
                    title: 'Bookshelf',
                    tabBarIcon: ({ color, size }) => (
                        <FontAwesome name="book" size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="about"
                options={{
                    title: 'About',
                    tabBarIcon: ({ color, size }) => (
                        <FontAwesome name="info-circle" size={size} color={color} />
                    ),
                }}
            />
        </Tabs>
        </ThemeProvider>
    );
}