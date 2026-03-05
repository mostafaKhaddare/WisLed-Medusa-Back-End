const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:Wacwacrac123@127.0.0.1:5432/postgres',
  ssl: false
});

client.connect().then(async () => {
  console.log("Checking database sizes...");
  
  const query = `
    SELECT pg_database.datname as "name",
    pg_size_pretty(pg_database_size(pg_database.datname)) as "size"
    FROM pg_database
    ORDER BY pg_database_size(pg_database.datname) DESC;
  `;

  try {
    const res = await client.query(query);
    console.table(res.rows);
  } catch (err) {
    console.error("Error:", err.message);
  }
  await client.end();
});