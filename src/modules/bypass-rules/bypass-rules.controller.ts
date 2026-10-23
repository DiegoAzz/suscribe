import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../db/prisma.js';
import { z } from 'zod';
import { HttpMethod } from '@prisma/client';

const bypassSchema = z.object({
  applicationId: z.string().uuid().optional().nullable(),
  pathPattern: z.string().min(1).max(255),
  httpMethod: z.nativeEnum(HttpMethod).default(HttpMethod.ALL),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
});

export async function bypassRulesRoutes(fastify: FastifyInstance) {
  fastify.get('/api/v1/bypass-rules', async () => {
    return prisma.bypassRule.findMany({
      include: { application: true },
      orderBy: { createdAt: 'desc' },
    });
  });

  fastify.post('/api/v1/bypass-rules', async (request: FastifyRequest, reply: FastifyReply) => {
    const parse = bypassSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'Datos inválidos', details: parse.error.format() });
    }

    const created = await prisma.bypassRule.create({
      data: parse.data,
      include: { application: true },
    });

    return reply.code(201).send(created);
  });

  fastify.put('/api/v1/bypass-rules/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const parse = bypassSchema.partial().safeParse(request.body);

    if (!parse.success) {
      return reply.code(400).send({ error: 'Datos inválidos', details: parse.error.format() });
    }

    const updated = await prisma.bypassRule.update({
      where: { id },
      data: parse.data,
      include: { application: true },
    });

    return updated;
  });

  fastify.delete('/api/v1/bypass-rules/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    await prisma.bypassRule.delete({ where: { id } });
    return { message: 'Regla de bypass eliminada con éxito' };
  });
}
