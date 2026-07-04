require('dotenv').config();

const http = require('http');
const express = require('express');
const session = require('express-session');
const path = require('path');

require('./db/database');
const { seedJsaForm } = require('./services/jsa');
const { seedDailyInspectionForm } = require('./services/daily-inspection');
const { seedBladeInspectionForm } = require('./services/blade-inspection');
const { seedBladeRepairForm } = require('./services/blade-repair');
const { cleanupOrphanForms } = require('./services/forms-cleanup');
const { seedDefaultRoom } = require('./services/chat');
seedJsaForm();
seedDailyInspectionForm();
seedBladeInspectionForm();
seedBladeRepairForm();
cleanupOrphanForms();

const { seedTimeSettings } = require('./services/time');
seedTimeSettings();
seedDefaultRoom();

const authRoutes = require('./routes/auth');
const employeeRoutes = require('./routes/employee');
const timeRoutes = require('./routes/time');
const managerRoutes = require('./routes/manager');
const managerTimeRoutes = require('./routes/manager-time');
const chatRoutes = require('./routes/chat');
const managerUsersRoutes = require('./routes/manager-users');
const { requireAuth } = require('./middleware/auth');
const { initChatSocket } = require('./sockets/chat');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  app.set('trust proxy', 1);
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    secure: isProduction,
    sameSite: 'lax',
  },
});

app.use(sessionMiddleware);

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

app.get('/', requireAuth, (req, res) => {
  if (req.session.user.role === 'manager') {
    return res.redirect('/manager');
  }
  res.redirect('/employee');
});

app.use('/', authRoutes);
app.use('/employee', employeeRoutes);
app.use('/time', timeRoutes);
app.use('/manager', managerRoutes);
app.use('/manager/time', managerTimeRoutes);
app.use('/chat', chatRoutes);
app.use('/manager/users', managerUsersRoutes);

const chatIo = initChatSocket(server, sessionMiddleware);
app.set('chatIo', chatIo);

app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Not Found',
    message: 'The page you requested does not exist.',
    user: req.session.user || null,
  });
});

server.listen(PORT, () => {
  console.log(`Work Log App running at http://localhost:${PORT}`);
  console.log('');
  console.log('Demo accounts:');
  console.log('  Employee: employee@company.com / password123');
  console.log('  Manager:  manager@company.com / password123');
});