await rest.put(
  Routes.applicationCommands(process.env.CLIENT_ID),
  { body: [] }
);