const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const supabase = require('../config/supabase');

const COLORS = ['#6C63FF','#FF6584','#43B89C','#F7B731','#E55353','#45AAF2','#A55EEA','#26DE81'];

const signup = async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password)
      return res.status(400).json({ message: 'All fields required' });

    const { data: ex } = await supabase
      .from('users').select('id')
      .or(`email.eq.${email},username.eq.${username}`);
    if (ex?.length) return res.status(400).json({ message: 'Email or username already taken' });

    const password_hash = await bcrypt.hash(password, 10);
    const avatar_color  = COLORS[Math.floor(Math.random() * COLORS.length)];

    const { data: user, error } = await supabase
      .from('users')
      .insert({ username, email, password_hash, avatar_color })
      .select('id,username,email,avatar_color')
      .single();
    if (error) throw error;

    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
    res.status(201).json({ token, user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const { data: user } = await supabase
      .from('users').select('*').eq('email', email).single();
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(400).json({ message: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
    res.json({ token, user: { id: user.id, username: user.username, email: user.email, avatar_color: user.avatar_color } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getMe = async (req, res) => {
  const { data: user } = await supabase
    .from('users').select('id,username,email,avatar_color')
    .eq('id', req.user.id).single();
  res.json(user);
};

module.exports = { signup, login, getMe };
