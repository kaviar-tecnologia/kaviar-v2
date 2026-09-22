const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('ADMIN_JWT_SECRET ou JWT_SECRET deve estar configurado no ambiente');
}

// Substitui pelo ID do admin que você quer usar
const adminId = 'ADMIN_ID_AQUI';

const token = jwt.sign(
  { 
    userId: adminId,
    userType: 'ADMIN'
  },
  JWT_SECRET,
  { expiresIn: '24h' }
);

console.log('\n🔑 Token gerado:\n');
console.log(token);
console.log('\n');
