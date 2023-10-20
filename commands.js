import 'dotenv/config';
import { getRPSChoices } from './game.js';
import { capitalize, InstallGlobalCommands } from './utils.js';
import { type } from 'os';

// Get the game choices from game.js
function createCommandChoices() {
  const choices = getRPSChoices();
  const commandChoices = [];

  for (let choice of choices) {
    commandChoices.push({
      name: capitalize(choice),
      value: choice.toLowerCase(),
    });
  }

  return commandChoices;
}

// Simple test command
const TEST_COMMAND = {
  name: 'test',
  description: 'Basic command',
  type: 1,
};

// Start command
const START_COMMAND = {
  name: 'start',
  description: 'Start a game session and let players join your lobby!',
  type: 1,
  options: [
    {
      type: 4,
      name: 'players',
      description: 'Set the maximum amount of players',
      required: true,
      min_value: 4,
      max_value: 10,
    },
  ],
};

// Cancel active game command
const CANCEL_COMMAND = {
  name: 'cancel',
  description: 'Cancel your current active game',
  type: 1,
};

// Test Database command
const TEST_DATABASE_COMMAND = {
  name: 'database_test',
  description: 'Test the database connection',
  type: 1,
};

const ALL_COMMANDS = [TEST_COMMAND, START_COMMAND, CANCEL_COMMAND, TEST_DATABASE_COMMAND];

InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS);