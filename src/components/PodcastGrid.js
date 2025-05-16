import React from 'react';
import { View, StyleSheet, Image } from 'react-native';

const PodcastGrid = () => {
  // #TODO: Replace with actual podcast images
  const podcastImages = [
    { id: 1, color: '#f0a30a' }, // Tim Ferriss Show (yellow)
    { id: 2, color: '#0e91d3' }, // Huberman Lab (blue)
    { id: 3, color: '#e74c3c' }, // Knowledge Project (red)
    { id: 4, color: '#2ecc71' }, // Another podcast (green)
    { id: 5, color: '#9b59b6' }, // Another podcast (purple)
    { id: 6, color: '#f39c12' }, // Tim Ferriss Show again (orange)
    { id: 7, color: '#3498db' }, // Making Sense (blue)
    { id: 8, color: '#1abc9c' }, // The Daily (teal)
    { id: 9, color: '#e74c3c' }, // This American Life (red)
    { id: 10, color: '#2ecc71'}, // Invest Like The Best (green)
    { id: 11, color: '#34495e'}, // Lex Fridman Podcast (dark blue)
    { id: 12, color: '#95a5a6'}, // Hidden Brain (gray)
    { id: 13, color: '#2ecc71' },
    { id: 14, color: '#9b59b6' },
    { id: 15, color: '#f39c12' },
  ];

  return (
    <View style={styles.container}>
      {podcastImages.map((podcast) => (
        <View 
          key={podcast.id} 
          style={[styles.podcastThumbnail, { backgroundColor: podcast.color }]}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    opacity: 0.3,
    zIndex: 0, 
  },
  podcastThumbnail: {
    width: '25%', // 4 thumbnails per row
    height: '25%', // 4 rows
    borderWidth: 1,
    borderColor: '#0f1624',
  },
});

export default PodcastGrid;
