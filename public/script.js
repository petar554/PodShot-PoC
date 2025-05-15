document.addEventListener('DOMContentLoaded', function() {
  const getStartedButton = document.querySelector('.get-started-button');
  const loginButton = document.querySelector('.login-button');
  
  getStartedButton.addEventListener('click', function() {
    alert('Get started clicked! This would navigate to the registration page.');
  });
  
  loginButton.addEventListener('click', function() {
    alert('Login clicked! This would navigate to the login page.');
  });
});
