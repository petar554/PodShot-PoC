import { verifyToken } from '../services/supabaseService.js';

export const authMiddleware = async (req, res, next) => {
  try {
    // get the authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }
    
    // extract the token
    const token = authHeader.split(' ')[1];
    
    // verify the token
    const user = await verifyToken(token);
    
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
    
    // add the user to the request object
    req.user = user;
    
    // continue to the next middleware or route handler
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({ error: 'Internal server error during authentication' });
  }
};
