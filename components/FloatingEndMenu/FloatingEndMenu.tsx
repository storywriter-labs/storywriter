import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

interface StoryReaderProps {
  story: string[];
  currentPage: number;
  setCurrentPage: (page: number) => void;
}

const FloatingEndMenu: React.FC<StoryReaderProps> = ({ story, currentPage, setCurrentPage }) => {
  const [showMenu, setShowMenu] = useState(false);
  const navigation = useNavigation();

  const handleRestartStory = () => {
    setCurrentPage(0);
    setShowMenu(false);
  };

  const handleNewStory = () => {
    setShowMenu(false);
    navigation.goBack()
  };

  const handleExit = () => {
    setShowMenu(false);
    navigation.goBack()
  };

  return (
    <View style={styles.container}>
      {/* Your existing story content */}
      <View style={styles.storyContent}>
        <Text style={styles.storyText}>{story[currentPage]}</Text>
      </View>

      {/* Floating Menu Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowMenu(true)}
        accessibilityLabel="Open menu"
      >
        <Ionicons name="menu" size={28} color="white" />
      </TouchableOpacity>

      {/* Menu Modal */}
      <Modal
        visible={showMenu}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowMenu(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowMenu(false)}
        >
          <View style={styles.menuContainer}>
            <TouchableOpacity
              style={styles.menuButton}
              onPress={handleRestartStory}
            >
              <View style={styles.menuButtonContent}>
                <Ionicons name="refresh" size={20} color="#333" />
                <Text style={styles.menuButtonText}>Start Over</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuButton}
              onPress={handleNewStory}
            >
              <View style={styles.menuButtonContent}>
                <Ionicons name="sparkles" size={20} color="#333" />
                <Text style={styles.menuButtonText}>New Story</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuButton, styles.exitButton]}
              onPress={handleExit}
            >
              <View style={styles.menuButtonContent}>
                <Ionicons name="home" size={20} color="#d32f2f" />
                <Text style={[styles.menuButtonText, styles.exitButtonText]}>Exit</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowMenu(false)}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f0',
  },
  storyContent: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  storyText: {
    fontSize: 18,
    lineHeight: 28,
    fontFamily: 'Georgia',
    color: '#333',
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  fabText: {
    fontSize: 24,
    color: 'white',
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuContainer: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    width: '80%',
    maxWidth: 300,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  menuButton: {
    backgroundColor: '#f0f0f0',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    alignItems: 'center',
  },
  menuButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  menuButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  exitButton: {
    backgroundColor: '#ffebee',
  },
  exitButtonText: {
    color: '#d32f2f',
  },
  cancelButton: {
    padding: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#666',
  },
});

export default FloatingEndMenu;