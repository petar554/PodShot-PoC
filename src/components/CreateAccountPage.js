import React from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Image, 
  StatusBar,
  Dimensions,
  ScrollView
} from 'react-native';
import PodcastGrid from './PodcastGrid';

const { width, height } = Dimensions.get('window');

const CreateAccountPage = ({ onBack, onGoogleLogin, onAppleLogin, onEmailLogin }) => {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <PodcastGrid />
      
      {/* dark overlay */}
      <View style={styles.darkOverlay} />
      
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Back button */}
        <TouchableOpacity 
          style={styles.backButton}
          onPress={onBack}
        >
          <Text style={styles.backButtonText}>✕</Text>
        </TouchableOpacity>
        
        <View style={styles.content}>
          {/*#TODO: add icon */}
          <View style={styles.iconContainer}>
            <View style={styles.userIconContainer}>
              <View style={styles.userIcon}>
                {/* main user icon */}
                <View style={styles.mainUserIcon} />
                {/* left small user icon */}
                <View style={[styles.smallUserIcon, styles.leftSmallIcon]} />
                {/* right small user icon */}
                <View style={[styles.smallUserIcon, styles.rightSmallIcon]} />
              </View>
            </View>
          </View>
          
          <Text style={styles.heading}>
            Let's create{'\n'}your account
          </Text>
          
          <Text style={styles.subheading}>
            Join 200,000+ podcast fans on{'\n'}their knowledge journey
          </Text>
          
          <TouchableOpacity 
            style={[styles.loginButton, styles.googleButton]}
            onPress={onGoogleLogin}
          >
            <View style={styles.buttonContent}>
              <View style={styles.googleIconContainer}>
                <Text style={styles.googleIcon}>G</Text>
              </View>
              <Text style={styles.loginButtonText}>Continue with Google</Text>
            </View>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.loginButton, styles.appleButton]}
            onPress={onAppleLogin}
          >
            <View style={styles.buttonContent}>
              <View style={styles.appleIconContainer}>
                <Text style={styles.appleIcon}>􀣺</Text>
              </View>
              <Text style={styles.loginButtonText}>Continue with Apple</Text>
            </View>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.loginButton, styles.emailButton]}
            onPress={onEmailLogin}
          >
            <View style={styles.buttonContent}>
              <View style={styles.emailIconContainer}>
                <Text style={styles.emailIcon}>✉</Text>
              </View>
              <Text style={styles.emailLoginText}>Continue with email</Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1624',
  },
  darkOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 22, 36, 0.4)',
    zIndex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    zIndex: 2, 
  },
  backButton: {
    position: 'absolute',
    top: 40,
    left: 20,
    zIndex: 3,
  },
  backButtonText: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    paddingTop: 100,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 30,
    marginTop: 50,
  },
  userIconContainer: {
    width: 120,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userIcon: {
    position: 'relative',
    width: 120,
    height: 80,
  },
  mainUserIcon: {
    position: 'absolute',
    width: 70,
    height: 70,
    backgroundColor: '#00c07f',
    borderRadius: 35,
    top: -10,
    left: 25,
  },
  smallUserIcon: {
    position: 'absolute',
    width: 35,
    height: 35,
    backgroundColor: '#00c07f',
    borderRadius: 17.5,
  },
  leftSmallIcon: {
    bottom: 0,
    left: 0,
  },
  rightSmallIcon: {
    bottom: 0,
    right: 0,
  },
  heading: {
    color: 'white',
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 42,
  },
  subheading: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 24,
  },
  loginButton: {
    borderRadius: 30,
    paddingVertical: 16,
    paddingHorizontal: 20,
    width: '100%',
    alignItems: 'center',
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleButton: {
    backgroundColor: 'white',
  },
  appleButton: {
    backgroundColor: 'white',
  },
  emailButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  loginButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0f1624',
    textAlign: 'center',
  },
  emailLoginText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
  },
  googleIconContainer: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  appleIconContainer: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  emailIconContainer: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  googleIcon: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f1624',
  },
  appleIcon: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f1624',
  },
  emailIcon: {
    fontSize: 18,
    color: 'white',
  },
});

export default CreateAccountPage;
