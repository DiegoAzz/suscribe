import { prisma } from '../../db/prisma.js';
import bcrypt from 'bcryptjs';

export class AuthService {
  async validateAdmin(email: string, plainPass: string) {
    const admin = await prisma.adminUser.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!admin || !admin.isActive) {
      return null;
    }

    const isValid = await bcrypt.compare(plainPass, admin.passwordHash);
    if (!isValid) {
      return null;
    }

    // Actualizar fecha de último login
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      id: admin.id,
      email: admin.email,
      fullName: admin.fullName,
      role: admin.role,
    };
  }

  async getAdminById(id: string) {
    return prisma.adminUser.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
  }
}

export const authService = new AuthService();
