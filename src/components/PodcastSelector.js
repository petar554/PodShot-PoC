import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator
} from 'react-native';

const API_URL = 'http://192.168.12.22:4000';

const PodcastSelector = ({ onPodcastEpisodeSelected }) => {
  const [podcastSearch, setPodcastSearch] = useState('');
  const [podcasts, setPodcasts] = useState([]);
  const [selectedPodcast, setSelectedPodcast] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [selectedEpisode, setSelectedEpisode] = useState(null);
  const [isLoadingPodcasts, setIsLoadingPodcasts] = useState(false);
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(false);
  const [showPodcastDropdown, setShowPodcastDropdown] = useState(false);
  const [showEpisodeDropdown, setShowEpisodeDropdown] = useState(false);

  // search for podcasts when the search term changes
  useEffect(() => {
    const searchPodcasts = async () => {
      if (podcastSearch.length < 2) {
        setPodcasts([]);
        return;
      }

      setIsLoadingPodcasts(true);
      try {
        console.log('Searching for podcasts:', podcastSearch);
        const response = await fetch(
          `https://itunes.apple.com/search?term=${encodeURIComponent(
            podcastSearch
          )}&country=US&media=podcast&entity=podcast&limit=20`
        );
        const data = await response.json();
        
        // extract unique podcasts by collectionId
        const uniquePodcasts = [];
        const podcastIds = new Set();
        
        data.results.forEach(item => {
          if (!podcastIds.has(item.collectionId)) {
            podcastIds.add(item.collectionId);
            uniquePodcasts.push({
              id: item.collectionId,
              name: item.collectionName,
              feedUrl: item.feedUrl,
              artworkUrl: item.artworkUrl100
            });
          }
        });
        
        setPodcasts(uniquePodcasts);
      } catch (error) {
        console.error('Error searching podcasts:', error);
        // show empty results but don't crash
        setPodcasts([]);
      } finally {
        setIsLoadingPodcasts(false);
      }
    };

    const debounceTimeout = setTimeout(searchPodcasts, 500);
    return () => clearTimeout(debounceTimeout);
  }, [podcastSearch]);

  // fetch episodes when a podcast is selected
  useEffect(() => {
    const fetchEpisodes = async () => {
      if (!selectedPodcast) {
        setEpisodes([]);
        return;
      }

      setIsLoadingEpisodes(true);
      try {
        const response = await fetch(
          `https://itunes.apple.com/lookup?id=${selectedPodcast.id}&country=US&media=podcast&entity=podcastEpisode&limit=50`
        );
        const data = await response.json();
        
        // filter out the podcast itself and only keep episodes
        const episodesList = data.results
          .filter(item => item.wrapperType === 'podcastEpisode')
          .map(item => ({
            id: item.trackId,
            name: item.trackName,
            releaseDate: new Date(item.releaseDate),
            duration: item.trackTimeMillis
          }))
          .sort((a, b) => b.releaseDate - a.releaseDate); //sort by newest first
        
        setEpisodes(episodesList);
      } catch (error) {
        console.error('Error fetching episodes:', error);
        setEpisodes([]);
      } finally {
        setIsLoadingEpisodes(false);
      }
    };

    fetchEpisodes();
  }, [selectedPodcast]);

  // when both podcast and episode are selected, notify the parent component
  useEffect(() => {
    if (selectedPodcast && selectedEpisode) {
      onPodcastEpisodeSelected(selectedPodcast, selectedEpisode);
    }
  }, [selectedPodcast, selectedEpisode, onPodcastEpisodeSelected]);

  const handlePodcastSelect = (podcast) => {
    setSelectedPodcast(podcast);
    setPodcastSearch(podcast.name);
    setShowPodcastDropdown(false);
    setSelectedEpisode(null); // reset episode selection
    setShowEpisodeDropdown(true); // show episode dropdown after selecting podcast
  };

  const handleEpisodeSelect = (episode) => {
    setSelectedEpisode(episode);
    setShowEpisodeDropdown(false);
  };

  //format duration from milliseconds to MM:SS
  const formatDuration = (milliseconds) => {
    if (!milliseconds) return '';
    
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // format date to a readable format
  const formatDate = (date) => {
    if (!date) return '';
    
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <View style={styles.container}>
      {/* Podcast Selection */}
      <View style={styles.inputContainer}>
        <Text style={styles.label}>Podcast Title</Text>
        <TouchableOpacity 
          style={styles.inputField}
          onPress={() => setShowPodcastDropdown(!showPodcastDropdown)}
        >
          <TextInput
            style={styles.input}
            placeholder="Search for a podcast..."
            placeholderTextColor="rgba(255, 255, 255, 0.5)"
            value={podcastSearch}
            onChangeText={(text) => {
              setPodcastSearch(text);
              setShowPodcastDropdown(true);
            }}
            onFocus={() => setShowPodcastDropdown(true)}
          />
        </TouchableOpacity>
        
        {showPodcastDropdown && (
          <View style={styles.dropdown}>
            {isLoadingPodcasts ? (
              <ActivityIndicator color="#00c07f" size="small" />
            ) : podcasts.length > 0 ? (
              <ScrollView 
                style={styles.scrollList}
                contentContainerStyle={styles.scrollContent}
                nestedScrollEnabled={true}
                showsVerticalScrollIndicator={true}
              >
                {podcasts.map(item => (
                  <TouchableOpacity
                    key={item.id.toString()}
                    style={styles.dropdownItem}
                    onPress={() => handlePodcastSelect(item)}
                  >
                    <Text style={styles.dropdownItemText}>{item.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : podcastSearch.length >= 2 ? (
              <Text style={styles.noResultsText}>No podcasts found</Text>
            ) : null}
          </View>
        )}
      </View>

      {/* episode Selection - only show if a podcast is selected */}
      {selectedPodcast && (
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Podcast Episode</Text>
          <TouchableOpacity 
            style={styles.inputField}
            onPress={() => setShowEpisodeDropdown(!showEpisodeDropdown)}
          >
            <Text style={[styles.input, !selectedEpisode && styles.placeholderText]}>
              {selectedEpisode ? selectedEpisode.name : "Select an episode..."}
            </Text>
          </TouchableOpacity>
          
          {showEpisodeDropdown && (
            <View style={styles.dropdown}>
              {isLoadingEpisodes ? (
                <ActivityIndicator color="#00c07f" size="small" />
              ) : episodes.length > 0 ? (
                <ScrollView 
                  style={styles.scrollList}
                  contentContainerStyle={styles.scrollContent}
                  nestedScrollEnabled={true}
                  showsVerticalScrollIndicator={true}
                >
                  {episodes.map(item => (
                    <TouchableOpacity
                      key={item.id.toString()}
                      style={styles.dropdownItem}
                      onPress={() => handleEpisodeSelect(item)}
                    >
                      <Text style={styles.dropdownItemText}>{item.name}</Text>
                      <Text style={styles.episodeDetails}>
                        {formatDate(item.releaseDate)} • {formatDuration(item.duration)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              ) : (
                <Text style={styles.noResultsText}>No episodes found</Text>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginBottom: 20,
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  inputField: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  input: {
    color: 'white',
    fontSize: 16,
  },
  placeholderText: {
    color: 'rgba(255, 255, 255, 0.94)',
  },
  dropdown: {
    position: 'absolute',
    top: 80,
    left: 0,
    right: 0,
    backgroundColor: '#1a2234',
    borderRadius: 8,
    maxHeight: 250,
    zIndex: 10,
    elevation: 5,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  scrollList: {
    maxHeight: 250,
  },
  scrollContent: {
    paddingVertical: 4,
  },
  dropdownItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  dropdownItemText: {
    color: 'white',
    fontSize: 14,
  },
  episodeDetails: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    marginTop: 4,
  },
  noResultsText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
    padding: 16,
    textAlign: 'center',
  },
});

export default PodcastSelector;
