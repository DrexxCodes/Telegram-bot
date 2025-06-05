import { FastifyInstance } from "fastify";

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.get('/auth', async (req, reply) => {
    return { message: 'Auth route active' };
  });
}
