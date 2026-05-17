# LinawLetra Frontend

React + Tailwind CSS frontend for the LinawLetra platform.

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Create a `.env` file:
```
REACT_APP_API_URL=http://localhost:5000/api
```

> For Expo or mobile builds, you can also use `EXPO_PUBLIC_API_URL` or `API_BASE_URL` to point to the same backend URL.

### 3. Start Development Server
```bash
npm start
```

Opens at: `http://localhost:3000`

## Project Structure

### Components (`src/components/`)
- `Navigation.js` - Main navigation bar
- `Login.js` - Login page component
- `Register.js` - Parent registration component
- `StudentManagement.js` - Manage enrolled children
- `AssessmentComponent.js` - Literacy assessment interface
- `LessonComponent.js` - Lesson viewer with TTS support

### Pages (`src/pages/`)
- `Home.js` - Landing page
- `Dashboard.js` - Student progress dashboard

### Context (`src/context/`)
- `AuthContext.js` - Global authentication state

### Services (`src/services/`)
- `api.js` - Centralized API service with axios instance

### Styling
- `index.css` - Global dyslexia-friendly stylesheet

## Features

### Authentication
- Parent-only registration
- JWT token-based login
- Protected routes
- Automatic logout on token expiry

### Student Management
- Add/enroll children
- View child details
- Track assessments

### Assessment
- Multi-category literacy assessment
- Progress bar
- Score tracking
- Personalized learning path generation

### Lessons
- Tagalog text display with proper formatting
- Text-to-Speech (TTS) support
- Responsive lesson viewer
- Progress tracking

### Dashboard
- Student selection
- Quick statistics (completed lessons, completion rate, average score)
- Recent activity
- Mobile responsive

### Dyslexia-Friendly Design
- Josefin Sans + Comic Sans typography
- Proper letter spacing (0.06em)
- Increased line height (1.8)
- Green and Blue color scheme
- Minimalist, uncluttered interface
- High contrast for readability

## Building

### Development Build
```bash
npm start
```

### Production Build
```bash
npm run build
```

Creates optimized build in `build/` folder.

## Available Scripts

- `npm start` - Run development server
- `npm run build` - Create production build
- `npm test` - Run tests
- `npm run eject` - Eject from Create React App (irreversible)

## Responsive Design

The app is fully responsive:
- Mobile-first approach
- Grid layouts with auto-fit columns
- Flexible typography sizing
- Touch-friendly buttons

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Performance

- Code splitting with React.lazy (optional enhancement)
- Efficient re-renders with proper component structure
- Optimized API calls with centralized service
- CSS in JavaScript for scoped styling

## Accessibility

- Semantic HTML
- Proper heading hierarchy
- ARIA labels where needed
- Keyboard navigation support
- Color contrast compliance

## Troubleshooting

### Blank Page on Startup
- Check browser console for errors
- Ensure backend API is running
- Verify `.env` configuration

### API Connection Issues
- Confirm `REACT_APP_API_URL`, `EXPO_PUBLIC_API_URL`, or `API_BASE_URL` is correct
- Check backend is running on correct port
- Verify CORS is enabled on backend

### Styling Not Applying
- Clear browser cache
- Restart development server
- Check CSS file is imported

## Deployment

### Vercel
```bash
npm install -g vercel
vercel
```

### Netlify
1. Connect GitHub repository
2. Set build command: `npm run build`
3. Set publish directory: `build`

### Docker
```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

## Environment Setup for Production

Update `.env` for production API:
```
REACT_APP_API_URL=https://api.yourdomain.com
```

> For mobile/Expo, the same backend URL can also be assigned to `EXPO_PUBLIC_API_URL` or `API_BASE_URL`.

## Documentation

- [React Documentation](https://react.dev/)
- [React Router Documentation](https://reactrouter.com/)
- [Axios Documentation](https://axios-http.com/)
- [Dyslexia-Friendly Web Design](https://www.bdadyslexia.org.uk/)
