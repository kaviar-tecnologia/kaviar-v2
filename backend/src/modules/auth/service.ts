import { prisma } from '../../lib/prisma';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';

export class AuthService {
  async login(email: string, password: string) {
    // Find admin user
    const admin = await prisma.admins.findUnique({
      where: { email },
    });

    if (!admin || !admin.is_active) {
      throw new Error('Credenciais inválidas');
    }

    // Verify password
    const isValid = await bcrypt.compare(password, admin.password);
    if (!isValid) {
      throw new Error('Credenciais inválidas');
    }

    // Generate token with role
    const token = jwt.sign(
      { 
        userId: admin.id, 
        userType: 'ADMIN',
        email: admin.email,
        role: admin.role,
      },
      (process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET)!,
      { expiresIn: '24h' }
    );

    return {
      token,
      user: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
      },
      mustChangePassword: admin.must_change_password || false,
    };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const admin = await prisma.admins.findUnique({
      where: { id: userId },
    });

    if (!admin) {
      throw new Error('Usuário não encontrado');
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, admin.password);
    if (!isValid) {
      throw new Error('Senha atual incorreta');
    }

    // Validate new password
    if (newPassword.length < 8) {
      throw new Error('Nova senha deve ter pelo menos 8 caracteres');
    }

    // Hash new password
    const newHash = await bcrypt.hash(newPassword, 10);

    // Update password
    await prisma.admins.update({
      where: { id: userId },
      data: {
        password: newHash,
        must_change_password: false,
        password_changed_at: new Date(),
        updated_at: new Date(),
      },
    });

    return { success: true };
  }
}
