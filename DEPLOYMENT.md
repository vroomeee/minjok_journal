# Deployment Guide

This guide covers deploying 민족 Journal to production.

## Prerequisites

- Completed Supabase setup (database schema and storage bucket)
- Environment variables configured
- Production-ready domain (optional)

## Build the Application

```bash
npm run build
```

This creates an optimized production build in the `build/` directory.

## Deployment Options

### Option 1: Deploy to a Node.js Server

The application can run on any Node.js hosting service.

1. **Copy files to your server**:
   ```bash
   scp -r build/ package.json package-lock.json user@yourserver:/path/to/app
   ```

2. **On the server, install dependencies**:
   ```bash
   cd /path/to/app
   npm install --production
   ```

3. **Set environment variables**:
   ```bash
   export SUPABASE_URL=your-url
   export SUPABASE_ANON_KEY=your-key
   ```

4. **Start the server**:
   ```bash
   npm start
   ```

5. **Use a process manager** (recommended):
   ```bash
   # Using PM2
   npm install -g pm2
   pm2 start "npm start" --name minjok-journal
   pm2 save
   pm2 startup
   ```

### Option 2: Deploy to Vercel

React Router v7 works great with Vercel.

1. **Install Vercel CLI**:
   ```bash
   npm install -g vercel
   ```

2. **Deploy**:
   ```bash
   vercel
   ```

3. **Add environment variables** in Vercel dashboard:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`

### Option 3: Deploy to Railway

Railway supports Node.js applications out of the box.

1. Create a new project on [railway.app](https://railway.app)
2. Connect your GitHub repository
3. Add environment variables in Railway settings
4. Deploy

### Option 4: Deploy to Fly.io

1. **Install Fly CLI**:
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. **Create a Fly app**:
   ```bash
   fly launch
   ```

3. **Set secrets**:
   ```bash
   fly secrets set SUPABASE_URL=your-url
   fly secrets set SUPABASE_ANON_KEY=your-key
   ```

4. **Deploy**:
   ```bash
   fly deploy
   ```

## Environment Variables

Make sure these are set in your production environment:

- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Your Supabase anonymous key

## Post-Deployment Checklist

- [ ] Database schema is applied in Supabase
- [ ] Storage bucket "articles" is created
- [ ] Environment variables are set
- [ ] Application builds successfully
- [ ] Authentication works (login/signup)
- [ ] File uploads work
- [ ] All routes are accessible

## Monitoring

Consider setting up:
- Error tracking (e.g., Sentry)
- Analytics (e.g., Google Analytics, Plausible)
- Uptime monitoring

## Security Notes

- Never commit `.env` file to version control
- Use strong passwords for admin accounts
- Regularly update dependencies
- Review Supabase RLS policies
- Monitor for suspicious activity

## Updating the Application

1. Pull latest changes
2. Run `npm install` if dependencies changed
3. Run `npm run build`
4. Restart the server

For zero-downtime deployments, consider using:
- Load balancer with multiple instances
- Blue-green deployment strategy
- Kubernetes for orchestration
