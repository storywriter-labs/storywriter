import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Layout from '../../components/Layout/Layout';
import { Colors, Spacing, BorderRadius, FontSizes } from '../../constants/theme';

export default function AboutScreen() {
  return (
    <Layout>
      <View style={styles.container}>
        <View style={styles.card}>
          <View style={styles.titleContainer}>
            <Text style={styles.title}>About StoryWriter</Text>
            <View style={styles.decorativeLine} />
          </View>
          <Text style={styles.text}>Create your own digital storybooks with the help of a cyber assistant!</Text>
          <Text style={styles.text}>This app is designed for kids to use on a tablet. They can speak with an AI assistant to generate text and images in a storybook display, and the machine will read out the story.</Text>
          <Text style={styles.text}>This is for entertainment purposes and to encourage a love of books and storytelling in young technologists!</Text>
          <Text style={styles.text}>Created by <a href="https://rindyportfolio.com">Rindy Portfolio</a> and <a href="http://tim-beckett.com/">Tim Beckett</a>.</Text>
        </View>
      </View>
    </Layout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  card: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.large,
    padding: Spacing.xxxl,
    maxWidth: 600,
    width: '100%',
    alignItems: 'center',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 12,
    borderWidth: 4,
    borderColor: Colors.yellow,
  },
  titleContainer: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: FontSizes.enormous,
    fontWeight: 'bold',
    color: Colors.coral,
    textAlign: 'center',
    textShadowColor: 'rgba(255, 107, 107, 0.3)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 6,
  },
  decorativeLine: {
    width: 160,
    height: 6,
    backgroundColor: Colors.yellow,
    borderRadius: 3,
    marginTop: Spacing.md,
  },
  text: {
    fontSize: FontSizes.xxl,
    color: Colors.darkGray,
    textAlign: 'left',
    fontWeight: '500',
    marginBottom: Spacing.lg,
  },
});
