import { prisma } from '../lib/prisma';
import bcrypt from 'bcryptjs';

async function createDefaultAdmin() {
  try {
    const defaultAdminEmail = process.env.ADMIN_DEFAULT_EMAIL || 'admin@kaviar.com';
    const defaultAdminPassword = process.env.ADMIN_DEFAULT_PASSWORD;

    if (!defaultAdminPassword) {
      throw new Error('ADMIN_DEFAULT_PASSWORD deve estar configurada no ambiente');
    }

    // Check if SUPER_ADMIN role exists
    let superAdminRole = await prisma.roles.findUnique({
      where: { name: 'SUPER_ADMIN' }
    });

    if (!superAdminRole) {
      superAdminRole = await prisma.roles.create({
        data: { name: 'SUPER_ADMIN' }
      });
      console.log('✅ Role SUPER_ADMIN criada');
    }

    // Check if OPERATOR role exists
    let operatorRole = await prisma.roles.findUnique({
      where: { name: 'OPERATOR' }
    });

    if (!operatorRole) {
      operatorRole = await prisma.roles.create({
        data: { name: 'OPERATOR' }
      });
      console.log('✅ Role OPERATOR criada');
    }

    // Check if default admin exists
    const existingAdmin = await prisma.admins.findUnique({
      where: { email: defaultAdminEmail }
    });

    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash(defaultAdminPassword, 12);
      
      await prisma.admins.create({
        data: {
          name: 'Admin Kaviar',
          email: defaultAdminEmail,
          passwordHash: hashedPassword,
          roleId: superAdminRole.id,
          isActive: true,
        }
      });
      
      console.log('✅ Admin padrão criado');
      console.log(`📧 Email: ${defaultAdminEmail}`);
      console.log('🔑 Senha: definida via ADMIN_DEFAULT_PASSWORD');
    } else {
      console.log('ℹ️  Admin padrão já existe');
    }

  } catch (error) {
    console.error('❌ Erro ao criar admin padrão:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createDefaultAdmin();
