// server/test/auth_and_roles.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/http/app';
import { initDb, closeDb } from '../src/db';
import type { FastifyInstance } from 'fastify';

describe('Auth & Roles (Admin vs User)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    initDb(':memory:');
    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    closeDb();
  });

  it('crée un compte utilisateur standard avec username et téléphone unique', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        username: 'john_doe',
        phoneNumber: '+1 555 100 2000',
        displayName: 'John Doe',
        password: 'password123',
        role: 'user',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.token).toBeDefined();
    expect(body.user.username).toBe('john_doe');
    expect(body.user.phoneNumber).toBe('+1 555 100 2000');
    expect(body.user.role).toBe('user');
  });

  it('refuse un nom d utilisateur dupliqué (insensible à la casse)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        username: 'JOHN_DOE',
        phoneNumber: '+1 555 100 9999',
        displayName: 'Another John',
        password: 'password123',
      },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('USERNAME_TAKEN');
  });

  it('refuse un numéro de téléphone dupliqué', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        username: 'jane_doe',
        phoneNumber: '+1 555 100 2000', // déjà utilisé par john_doe
        displayName: 'Jane Doe',
        password: 'password123',
      },
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error.code).toBe('PHONE_TAKEN');
  });

  it('permet la connexion par pseudo OU par numéro de téléphone', async () => {
    // Connexion par pseudo
    const loginUsername = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        usernameOrPhone: 'john_doe',
        password: 'password123',
      },
    });
    expect(loginUsername.statusCode).toBe(200);

    // Connexion par numéro de téléphone
    const loginPhone = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        usernameOrPhone: '+1 555 100 2000',
        password: 'password123',
      },
    });
    expect(loginPhone.statusCode).toBe(200);
  });

  it('permet à un admin d accéder à /admin/stats et refuse un utilisateur normal', async () => {
    // 1. Inscrire un admin
    const adminRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        username: 'super_admin',
        phoneNumber: '+1 555 999 8888',
        displayName: 'Super Admin',
        password: 'adminpassword',
        role: 'admin',
      },
    });
    const { token: adminToken } = JSON.parse(adminRes.body);

    // 2. Inscrire un user standard
    const userRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        username: 'simple_user',
        phoneNumber: '+1 555 888 7777',
        displayName: 'Simple User',
        password: 'userpassword',
        role: 'user',
      },
    });
    const { token: userToken } = JSON.parse(userRes.body);

    // User standard -> 403 Forbidden sur /admin/stats
    const userAccess = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/stats',
      headers: { authorization: `Bearer ${userToken}` },
    });
    expect(userAccess.statusCode).toBe(403);

    // Admin -> 200 OK avec les statistiques
    const adminAccess = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/stats',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(adminAccess.statusCode).toBe(200);
    const stats = JSON.parse(adminAccess.body);
    expect(stats.totalUsers).toBeGreaterThanOrEqual(3);
  });
});
