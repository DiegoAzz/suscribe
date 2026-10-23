import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authService } from './auth.service.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export async function authRoutes(fastify: FastifyInstance) {
  // Login
  fastify.post('/api/v1/auth/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const parse = loginSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'Credenciales inválidas', details: parse.error.format() });
    }

    const { email, password } = parse.data;
    const admin = await authService.validateAdmin(email, password);

    if (!admin) {
      return reply.code(401).send({ error: 'Correo o contraseña incorrectos' });
    }

    // Generar JWT
    const token = fastify.jwt.sign(
      {
        id: admin.id,
        email: admin.email,
        role: admin.role,
      },
      { expiresIn: '7d' },
    );

    // Cookie segura HttpOnly
    reply.setCookie('appzplay_token', token, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 días
    });

    return reply.send({
      message: 'Inicio de sesión exitoso',
      user: admin,
      token,
    });
  });

  // Me
  fastify.get('/api/v1/auth/me', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Verificar token en cabecera Authorization o Cookie
      const token =
        request.cookies.appzplay_token ||
        request.headers.authorization?.replace(/^Bearer\s+/i, '');

      if (!token) {
        return reply.code(401).send({ error: 'No autenticado' });
      }

      const decoded = fastify.jwt.verify<{ id: string; email: string; role: string }>(token);
      const user = await authService.getAdminById(decoded.id);

      if (!user || !user.isActive) {
        return reply.code(401).send({ error: 'Usuario no encontrado o inactivo' });
      }

      return reply.send({ user });
    } catch {
      return reply.code(401).send({ error: 'Token inválido o expirado' });
    }
  });

  // Logout
  fastify.post('/api/v1/auth/logout', async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.clearCookie('appzplay_token', { path: '/' });
    return reply.send({ message: 'Sesión cerrada correctamente' });
  });
}
