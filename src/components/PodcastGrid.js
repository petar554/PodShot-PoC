import React from 'react';
import { View, StyleSheet, Image } from 'react-native';

const PodcastGrid = () => {
  // Using actual podcast images from assets
  const podcastImages = [
    { id: 1, source: require('../../assets/GridImages/1.jpeg') },
    { id: 2, source: require('../../assets/GridImages/2.jpg') },
    { id: 3, source: require('../../assets/GridImages/3.jpeg') },
    { id: 4, source: require('../../assets/GridImages/5.jpeg') },
    { id: 5, source: require('../../assets/GridImages/6.jpeg') },
    { id: 6, source: require('../../assets/GridImages/ab6765630000ba8ab85311900115d459884cae79.jpeg') },
    { id: 7, source: require('../../assets/GridImages/download(1).jpeg') },
    { id: 8, source: require('../../assets/GridImages/download(2).jpeg') },
    { id: 9, source: require('../../assets/GridImages/download(3).jpeg') },
    { id: 10, source: require('../../assets/GridImages/download(4).jpeg') },
    { id: 11, source: require('../../assets/GridImages/download.jpeg') },
    { id: 12, source: require('../../assets/GridImages/image.jpg') },
    { id: 13, source: require('../../assets/GridImages/download(1).png') },
    { id: 14, source: require('../../assets/GridImages/download(2).png') },
    { id: 15, source: require('../../assets/GridImages/download(3).png') },
    { id: 16, source: require('../../assets/GridImages/download(4).png') },
    { id: 17, source: require('../../assets/GridImages/download.png') },
  ];

  // shuffle the array to get a random arrangement of podcast images
  const shuffledImages = [...podcastImages].sort(() => 0.5 - Math.random());
  // Take only the first 16 images (4x4 grid)
  const displayImages = shuffledImages.slice(0, 16);

  return (
    <View style={styles.container}>
      {displayImages.map((podcast) => (
        <Image 
          key={podcast.id} 
          source={podcast.source}
          style={styles.podcastThumbnail}
          resizeMode="cover"
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
