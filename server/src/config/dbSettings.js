/**
 * Database connection settings.
 * Accepts either DATABASE_URL / MYSQL_URL (mysql://user:pass@host:3306/dbname),
 * as provided by many hosting/deploy tools, or the separate DB_* variables.
 */
function dbSettings() {
  const url = process.env.DATABASE_URL || process.env.MYSQL_URL;
  if (url && /^mysql:\/\//i.test(url)) {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: Number(u.port || 3306),
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: decodeURIComponent(u.pathname.replace(/^\//, '')) || process.env.DB_NAME || 'yjtechnosoft',
    };
  }
  return {
    host: process.env.DB_HOST || process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.DB_PORT || process.env.MYSQL_PORT || 3306),
    user: process.env.DB_USER || process.env.MYSQL_USER || 'root',
    password: process.env.DB_PASSWORD ?? process.env.MYSQL_PASSWORD ?? '',
    database: process.env.DB_NAME || process.env.MYSQL_DATABASE || 'yjtechnosoft',
  };
}

module.exports = { dbSettings };
