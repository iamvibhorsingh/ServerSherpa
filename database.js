const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'tour_bot.db');

// Connect to SQLite database
// The database will be created if it doesn't exist
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        initializeDatabase();
    }
});

// Function to initialize database tables
async function initializeDatabase() {
    // Use db.serialize to ensure CREATE TABLEs run sequentially first
    db.serialize(async () => {
        // Server configurations table
        // Stores server-specific settings, like custom welcome messages or tour entry points
        db.run(`CREATE TABLE IF NOT EXISTS server_configs (
            guild_id TEXT PRIMARY KEY,
            welcome_channel_id TEXT,
            custom_welcome_message TEXT,
            default_tour_id INTEGER,
            rules_channel_id TEXT,
            announcements_channel_id TEXT,
            guides_channel_id TEXT
        )`, (err) => {
            if (err) console.error('Error creating/altering server_configs table', err.message);
            // Don't add columns here, do it after all CREATEs
        });

        // Tours table
        // Stores the definition of different tours
        db.run(`CREATE TABLE IF NOT EXISTS tours (
            tour_id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT NOT NULL,
            tour_name TEXT NOT NULL,
            description TEXT,
            completion_role_id TEXT, -- ID of the role to assign upon completion
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (guild_id) REFERENCES server_configs(guild_id)
        )`, (err) => {
            if (err) console.error('Error creating tours table', err.message);
            else console.log('tours table ready.');
        });

        // Tour steps table
        // Stores individual steps for each tour
        db.run(`CREATE TABLE IF NOT EXISTS tour_steps (
            step_id INTEGER PRIMARY KEY AUTOINCREMENT,
            tour_id INTEGER NOT NULL,
            step_number INTEGER NOT NULL,
            title TEXT,
            content TEXT NOT NULL, -- Embed content (JSON or markdown)
            image_url TEXT,
            video_url TEXT,
            channel_to_showcase TEXT, -- Channel ID to highlight
            required_role_id TEXT, -- Role required to see this step (for role-based paths)
            UNIQUE(tour_id, step_number),
            FOREIGN KEY (tour_id) REFERENCES tours(tour_id)
        )`, (err) => {
            if (err) console.error('Error creating tour_steps table', err.message);
            else console.log('tour_steps table ready.');
        });

        // User progress table
        // Tracks which users have started/completed which tours and their current step
        db.run(`CREATE TABLE IF NOT EXISTS user_progress (
            progress_id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            guild_id TEXT NOT NULL,
            tour_id INTEGER NOT NULL,
            current_step_id INTEGER, -- Can be NULL if tour not started or just started
            status TEXT DEFAULT 'not_started', -- e.g., 'not_started', 'in_progress', 'completed'
            started_at DATETIME,
            completed_at DATETIME,
            UNIQUE(user_id, guild_id, tour_id),
            FOREIGN KEY (guild_id) REFERENCES server_configs(guild_id),
            FOREIGN KEY (tour_id) REFERENCES tours(tour_id),
            FOREIGN KEY (current_step_id) REFERENCES tour_steps(step_id)
        )`, (err) => {
            if (err) console.error('Error creating user_progress table', err.message);
            else console.log('user_progress table ready.');
        });

        // Analytics table (example, can be expanded)
        db.run(`CREATE TABLE IF NOT EXISTS tour_analytics (
            event_id INTEGER PRIMARY KEY AUTOINCREMENT,
            guild_id TEXT NOT NULL,
            tour_id INTEGER NOT NULL,
            user_id TEXT,
            event_type TEXT NOT NULL, -- e.g., 'tour_started', 'step_viewed', 'tour_completed', 'tour_exited'
            step_id INTEGER,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            metadata TEXT, -- JSON for additional data
            FOREIGN KEY (guild_id) REFERENCES server_configs(guild_id),
            FOREIGN KEY (tour_id) REFERENCES tours(tour_id),
            FOREIGN KEY (step_id) REFERENCES tour_steps(step_id)
        )`, (err) => {
            if (err) console.error('Error creating tour_analytics table', err.message);
        });

        // After all CREATE TABLE IF NOT EXISTS are likely done (within serialize scope)
        // Now, ensure columns exist using the async helper
        try {
            console.log('Ensuring necessary columns exist in server_configs...');
            await addColumnIfNotExists('server_configs', 'rules_channel_id', 'TEXT');
            await addColumnIfNotExists('server_configs', 'announcements_channel_id', 'TEXT');
            await addColumnIfNotExists('server_configs', 'guides_channel_id', 'TEXT');
            console.log('Column checks complete.');
        } catch (error) {
            console.error('Failed during column existence check:', error);
            // Decide how to handle this - maybe prevent bot startup?
        }
        
        console.log('Database structure initialization process finished.');
    });
}

// Helper to add columns safely (Refactored to use db.all)
function addColumnIfNotExists(tableName, columnName, columnType) {
    return new Promise((resolve, reject) => {
        db.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
            if (err) {
                console.error(`Error fetching table info for ${tableName}:`, err.message);
                return reject(err);
            }

            const columnExists = columns.some(column => column.name === columnName);

            if (!columnExists) {
                db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`, (alterErr) => {
                    if (alterErr) {
                        // Ignore 'duplicate column name' error which can happen in race conditions
                        if (!alterErr.message.includes('duplicate column name')) {
                            console.error(`Error adding column ${columnName} to ${tableName}:`, alterErr.message);
                            return reject(alterErr);
                        }
                        // If it was a duplicate error, the column exists, so we can resolve
                        resolve(false); // Indicate column was already there (or added concurrently)
                    } else {
                        console.log(`Added column ${columnName} to ${tableName}.`);
                        resolve(true); // Indicate column was added
                    }
                });
            } else {
                // Column already exists
                resolve(false); // Indicate column was already there
            }
        });
    });
}

function getTourDetails(tourId) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM tours WHERE tour_id = ?', [tourId], (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
}

function updateTourCompletionRole(tourId, completionRoleId) {
    return new Promise((resolve, reject) => {
        db.run('UPDATE tours SET completion_role_id = ? WHERE tour_id = ?', [completionRoleId, tourId], function(err) {
            if (err) return reject(err);
            resolve(this.changes);
        });
    });
}

function getServerConfig(guildId) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM server_configs WHERE guild_id = ?', [guildId], (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
}

function updateServerConfig(guildId, updates) {
    return new Promise((resolve, reject) => {
        // Define valid columns to prevent SQL injection via keys
        const validColumns = [
            'welcome_channel_id',
            'custom_welcome_message',
            'default_tour_id',
            'rules_channel_id',
            'announcements_channel_id',
            'guides_channel_id'
        ];

        let fields = [];
        let params = [];

        for (const key in updates) {
            if (updates.hasOwnProperty(key) && validColumns.includes(key)) {
                fields.push(`${key} = ?`);
                params.push(updates[key]);
            }
        }

        if (fields.length === 0) {
            console.log('updateServerConfig called with no valid fields to update for guild:', guildId, 'Updates:', updates);
            return resolve(0); // Resolve with 0 changes
        }

        params.push(guildId); // Add guild_id for the WHERE clause

        const sql = `UPDATE server_configs SET ${fields.join(', ')} WHERE guild_id = ?`;
        
        db.run(sql, params, function(err) {
            if (err) {
                 console.error(`Error updating server_configs for guild ${guildId}:`, err.message, 'SQL:', sql, 'Params:', params);
                 return reject(err);
            }
            if (this.changes > 0) {
                 console.log(`Successfully updated server_configs for guild ${guildId}. Changed ${this.changes} row(s). Updates:`, updates);
            }
            resolve(this.changes);
        });
    });
}

function addDefaultTour(guildId, tourName, steps, completionRoleId = null) { // steps is an array of { step_number, content, title }
    return new Promise((resolve, reject) => {
        db.run('INSERT INTO tours (guild_id, tour_name, completion_role_id) VALUES (?, ?, ?)', [guildId, tourName, completionRoleId], function(err) {
            if (err) return reject(err);
            const tourId = this.lastID;
            const stmt = db.prepare('INSERT INTO tour_steps (tour_id, step_number, title, content) VALUES (?, ?, ?, ?)');
            steps.forEach(step => {
                stmt.run(tourId, step.step_number, step.title, step.content);
            });
            stmt.finalize(err => {
                if (err) return reject(err);
                resolve(tourId);
            });
        });
    });
}

function getGuildTours(guildId) {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM tours WHERE guild_id = ?', [guildId], (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
}

function getTourSteps(tourId) {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM tour_steps WHERE tour_id = ? ORDER BY step_number ASC', [tourId], (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
}

function getUserProgress(userId, guildId) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM user_progress WHERE user_id = ? AND guild_id = ?', [userId, guildId], (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
}

function startOrUpdateUserTour(userId, guildId, tourId, currentStepId) {
    return new Promise((resolve, reject) => {
        const now = new Date().toISOString();
        db.run(`
            INSERT INTO user_progress (user_id, guild_id, tour_id, current_step_id, status, started_at)
            VALUES (?, ?, ?, ?, 'in_progress', ?)
            ON CONFLICT(user_id, guild_id, tour_id) DO UPDATE SET
            current_step_id = excluded.current_step_id,
            status = 'in_progress',
            started_at = COALESCE(user_progress.started_at, excluded.started_at), -- Keep original start time if exists
            completed_at = NULL -- Reset completion time if restarting
        `, [userId, guildId, tourId, currentStepId, now], function(err) {
            if (err) return reject(err);
            resolve(this.lastID || this.changes);
        });
    });
}

function updateUserProgress(userId, guildId, tourId, currentStepId) {
    return new Promise((resolve, reject) => {
        db.run(`UPDATE user_progress 
                 SET current_step_id = ?, status = 'in_progress' 
                 WHERE user_id = ? AND guild_id = ? AND tour_id = ?`, 
                 [currentStepId, userId, guildId, tourId], function(err) {
            if (err) return reject(err);
            resolve(this.changes);
        });
    });
}

function completeUserTour(userId, guildId, tourId) {
    return new Promise((resolve, reject) => {
        const now = new Date().toISOString();
        db.run(`UPDATE user_progress 
                 SET status = 'completed', completed_at = ? 
                 WHERE user_id = ? AND guild_id = ? AND tour_id = ? AND status = 'in_progress'`, 
                 [now, userId, guildId, tourId], function(err) {
            if (err) return reject(err);
            resolve(this.changes);
        });
    });
}

function endUserTour(userId, guildId, tourId, reason) { // reason can be 'user_exited', 'error_no_steps', etc.
    return new Promise((resolve, reject) => {
        // We might want to keep the progress but mark it as 'exited' or 'aborted'
        // For now, let's just update status. If we want to allow resuming, this needs more thought.
        db.run(`UPDATE user_progress 
                 SET status = ? 
                 WHERE user_id = ? AND guild_id = ? AND tour_id = ? AND status = 'in_progress'`, 
                 [reason, userId, guildId, tourId], function(err) {
            if (err) return reject(err);
            resolve(this.changes);
        });
    });
}

function logTourEvent(guildId, tourId, userId, eventType, stepId, metadata = null) {
    return new Promise((resolve, reject) => {
        db.run(`INSERT INTO tour_analytics (guild_id, tour_id, user_id, event_type, step_id, metadata) 
                 VALUES (?, ?, ?, ?, ?, ?)`, 
                 [guildId, tourId, userId, eventType, stepId, metadata ? JSON.stringify(metadata) : null], function(err) {
            if (err) return reject(err);
            resolve(this.lastID);
        });
    });
}

// Added ensureServerConfig back
function ensureServerConfig(guildId) {
    return new Promise((resolve, reject) => {
        db.run('INSERT OR IGNORE INTO server_configs (guild_id) VALUES (?)', [guildId], function(err) {
            if (err) {
                console.error(`Error ensuring server config for ${guildId}:`, err.message);
                return reject(err);
            }
            // Log whether a new row was inserted or if it already existed
            if (this.changes > 0) {
                console.log(`Server config created for guild ${guildId}.`);
            } else {
                // You might not need to log every time it already exists, could be verbose
                // console.log(`Server config already exists for guild ${guildId}.`);
            }
            resolve(this.changes > 0 ? 'Config created' : 'Config already exists');
        });
    });
}

// Function to add a new tour (without steps initially)
function addTour(guildId, tourName, description = null, completionRoleId = null) {
    return new Promise((resolve, reject) => {
        db.run('INSERT INTO tours (guild_id, tour_name, description, completion_role_id) VALUES (?, ?, ?, ?)', 
               [guildId, tourName, description, completionRoleId],
               function(err) {
            if (err) {
                console.error(`Error adding tour '${tourName}' for guild ${guildId}:`, err.message);
                return reject(err);
            }
            console.log(`Added new tour '${tourName}' with ID ${this.lastID} for guild ${guildId}.`);
            resolve(this.lastID); // Resolve with the new tour_id
        });
    });
}

// Function to find a tour by ID or Name for a specific guild
function findTourByNameOrId(guildId, identifier) {
    return new Promise((resolve, reject) => {
        let query = 'SELECT * FROM tours WHERE guild_id = ? AND ';
        let params = [guildId];

        if (isNaN(identifier)) {
            // Treat as name
            query += 'lower(tour_name) = lower(?)';
            params.push(identifier);
        } else {
            // Treat as ID
            query += 'tour_id = ?';
            params.push(parseInt(identifier));
        }

        db.get(query, params, (err, row) => {
            if (err) {
                console.error(`Error finding tour by identifier '${identifier}' for guild ${guildId}:`, err.message);
                return reject(err);
            }
            resolve(row); // Resolve with the tour row or null if not found
        });
    });
}

// Function to delete a tour and all its associated steps and progress
// Important: Use transactions for atomicity
function deleteTourAndSteps(tourId) {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run('BEGIN TRANSACTION', (err) => { if (err) return reject(err); });

            // Delete related analytics first (optional, depends on FK constraints or desired cleanup)
            db.run('DELETE FROM tour_analytics WHERE tour_id = ?', [tourId], (err) => {
                if (err) {
                    db.run('ROLLBACK');
                    return reject(err);
                }
            });
            
            // Delete user progress for this tour
            db.run('DELETE FROM user_progress WHERE tour_id = ?', [tourId], (err) => {
                if (err) {
                    db.run('ROLLBACK');
                    return reject(err);
                }
            });

            // Delete tour steps
            db.run('DELETE FROM tour_steps WHERE tour_id = ?', [tourId], (err) => {
                if (err) {
                    db.run('ROLLBACK');
                    return reject(err);
                }
            });

            // Delete the tour itself
            db.run('DELETE FROM tours WHERE tour_id = ?', [tourId], function(err) {
                if (err) {
                    db.run('ROLLBACK');
                    return reject(err);
                }
                const changes = this.changes;
                db.run('COMMIT', (commitErr) => {
                     if (commitErr) return reject(commitErr);
                     console.log(`Successfully deleted tour ${tourId} and associated data. Tour rows deleted: ${changes}`);
                     resolve(changes); // Resolve with the number of tours deleted (should be 1 or 0)
                 });
            });
        });
    });
}

// Function to get a specific step by its ID
function getTourStepById(stepId) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM tour_steps WHERE step_id = ?', [stepId], (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
}

// Function to get the maximum step number for a tour
function getMaxStepNumber(tourId) {
    return new Promise((resolve, reject) => {
        db.get('SELECT MAX(step_number) as max_step FROM tour_steps WHERE tour_id = ?', [tourId], (err, row) => {
            if (err) return reject(err);
            resolve(row ? row.max_step : -1); // Return max step or -1 if no steps
        });
    });
}

// Function to add a new step to a tour
// If stepNumber is null or undefined, adds to the end.
// If specified, inserts at that position and shifts subsequent steps.
function addTourStep(tourId, stepNumber, title, contentJson) {
    return new Promise(async (resolve, reject) => {
        try {
            const maxStep = await getMaxStepNumber(tourId);
            let targetStepNumber;

            if (stepNumber === null || stepNumber === undefined || stepNumber > maxStep + 1) {
                targetStepNumber = maxStep + 1; // Add to end
            } else {
                targetStepNumber = Math.max(0, stepNumber); // Ensure non-negative
            }

            db.serialize(() => {
                db.run('BEGIN TRANSACTION', (err) => { if (err) return reject(err); });

                // Shift steps if inserting in the middle
                if (targetStepNumber <= maxStep) {
                     db.run('UPDATE tour_steps SET step_number = step_number + 1 WHERE tour_id = ? AND step_number >= ?', 
                            [tourId, targetStepNumber],
                            (err) => {
                         if (err) {
                             db.run('ROLLBACK');
                             return reject(err);
                         }
                     });
                }

                // Insert the new step
                db.run('INSERT INTO tour_steps (tour_id, step_number, title, content) VALUES (?, ?, ?, ?)',
                       [tourId, targetStepNumber, title, contentJson],
                       function (err) {
                    if (err) {
                        db.run('ROLLBACK');
                        return reject(err);
                    }
                    const newStepId = this.lastID;
                    db.run('COMMIT', (commitErr) => {
                        if (commitErr) return reject(commitErr);
                         console.log(`Added step ${targetStepNumber} (ID: ${newStepId}) to tour ${tourId}.`);
                        resolve({ stepId: newStepId, assignedStepNumber: targetStepNumber });
                    });
                });
            });
        } catch (error) {
             reject(error);
        }
    });
}

// Function to edit an existing step by its step_id
function editTourStep(stepId, title, contentJson) {
    return new Promise((resolve, reject) => {
        db.run('UPDATE tour_steps SET title = ?, content = ? WHERE step_id = ?',
               [title, contentJson, stepId],
               function(err) {
            if (err) {
                console.error(`Error editing step ${stepId}:`, err.message);
                return reject(err);
            }
            console.log(`Edited step ${stepId}. Changes: ${this.changes}`);
            resolve(this.changes); // Resolve with number of rows changed
        });
    });
}

// Function to renumber steps sequentially for a tour (usually after delete/reorder)
function renumberTourSteps(tourId) {
    return new Promise((resolve, reject) => {
        db.all('SELECT step_id FROM tour_steps WHERE tour_id = ? ORDER BY step_number ASC', [tourId], (err, steps) => {
            if (err) return reject(err);

            db.serialize(() => {
                db.run('BEGIN TRANSACTION', (err) => { if (err) return reject(err); });
                let updatedCount = 0;
                steps.forEach((step, index) => {
                    db.run('UPDATE tour_steps SET step_number = ? WHERE step_id = ?', [index, step.step_id], function(err) {
                        if (err) {
                            // Attempt rollback on error
                            db.run('ROLLBACK', (rollbackErr) => {
                                if (rollbackErr) console.error("Rollback failed:", rollbackErr);
                                reject(err);
                            });
                            // Stop processing further steps on error
                            throw new Error(`Failed renumbering step ${step.step_id}: ${err.message}`); 
                        }
                        updatedCount += this.changes;
                    });
                });
                db.run('COMMIT', (commitErr) => {
                     if (commitErr) return reject(commitErr);
                     console.log(`Renumbered steps for tour ${tourId}. Total steps updated: ${updatedCount}`);
                     resolve(updatedCount);
                 });
            });
        });
    });
}

// Function to delete a step and renumber subsequent steps
function deleteTourStepAndRenumber(stepId) {
    return new Promise(async (resolve, reject) => {
         try {
             // First, find the tour_id of the step being deleted
             const step = await getTourStepById(stepId);
             if (!step) {
                 return reject(new Error(`Step with ID ${stepId} not found.`));
             }
             const tourId = step.tour_id;

            db.serialize(() => {
                db.run('BEGIN TRANSACTION', (err) => { if (err) return reject(err); });

                // Delete the step
                db.run('DELETE FROM tour_steps WHERE step_id = ?', [stepId], function(err) {
                    if (err) {
                        db.run('ROLLBACK');
                        return reject(err);
                    }
                    const deletedCount = this.changes;
                    if (deletedCount === 0) {
                        // Step didn't exist, commit harmlessly
                        db.run('COMMIT', (commitErr) => { 
                            if (commitErr) return reject(commitErr);
                            resolve(0); // Indicate nothing was deleted
                        });
                        return;
                    }
                    
                     // Commit the deletion before attempting renumbering
                    db.run('COMMIT', async (commitErr) => {
                         if (commitErr) return reject(commitErr);
                         console.log(`Deleted step ${stepId} from tour ${tourId}.`);
                         // Now renumber the remaining steps
                         try {
                            await renumberTourSteps(tourId);
                            resolve(deletedCount); // Resolve with the count of deleted steps (should be 1)
                         } catch (renumberError) {
                             console.error(`Failed to renumber steps for tour ${tourId} after deleting step ${stepId}:`, renumberError);
                             // The step is deleted, but renumbering failed. We might need manual intervention.
                             // Rejecting here might be appropriate to signal the partial success/failure.
                             reject(new Error(`Step ${stepId} deleted, but failed to renumber remaining steps.`));
                         }
                     });
                });
            });
        } catch (error) {
            reject(error);
        }
    });
}

// Function to move a step up or down, adjusting step numbers
function moveTourStep(stepId, direction) { // direction is 'up' or 'down'
    return new Promise(async (resolve, reject) => {
        try {
            const step = await getTourStepById(stepId);
            if (!step) {
                return reject(new Error(`Step with ID ${stepId} not found.`));
            }

            const { tour_id, step_number } = step;
            let targetStepNumber;

            if (direction === 'up') {
                if (step_number === 0) return resolve(0); // Cannot move step 0 up
                targetStepNumber = step_number - 1;
            } else if (direction === 'down') {
                const maxStep = await getMaxStepNumber(tour_id);
                if (step_number === maxStep) return resolve(0); // Cannot move last step down
                targetStepNumber = step_number + 1;
            } else {
                return reject(new Error('Invalid direction specified.'));
            }

            // Find the step currently at the target position
            const otherStep = await new Promise((res, rej) => {
                 db.get('SELECT step_id FROM tour_steps WHERE tour_id = ? AND step_number = ?', 
                        [tour_id, targetStepNumber], 
                        (err, row) => { if (err) rej(err); else res(row); });
            });

            if (!otherStep) {
                // This shouldn't happen if boundaries are checked correctly, but handle defensively
                return reject(new Error(`Could not find step at target position ${targetStepNumber} for tour ${tour_id}.`));
            }

            const otherStepId = otherStep.step_id;

            // Perform swap within a transaction
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                // Temporarily assign a unique high number to avoid UNIQUE constraint violation
                const tempStepNumber = -1 * stepId; // Use negative stepId temporarily
                db.run('UPDATE tour_steps SET step_number = ? WHERE step_id = ?', [tempStepNumber, stepId], (err) => {
                    if (err) { db.run('ROLLBACK'); return reject(err); }
                    
                    // Move the other step to the original step's number
                    db.run('UPDATE tour_steps SET step_number = ? WHERE step_id = ?', [step_number, otherStepId], (err) => {
                        if (err) { db.run('ROLLBACK'); return reject(err); }
                        
                        // Move the original step to the target number
                        db.run('UPDATE tour_steps SET step_number = ? WHERE step_id = ?', [targetStepNumber, stepId], function(err) {
                            if (err) { db.run('ROLLBACK'); return reject(err); }
                            
                            const changes = this.changes; // Capture changes from the final update
                            db.run('COMMIT', (commitErr) => {
                                if (commitErr) return reject(commitErr);
                                console.log(`Moved step ${stepId} ${direction} to position ${targetStepNumber} in tour ${tour_id}. Swapped with ${otherStepId}.`);
                                resolve(changes > 0 ? 2 : 0); // Expect 2 changes ideally (one for each step update that matters)
                            });
                        });
                    });
                });
            });

        } catch (error) {
            reject(error);
        }
    });
}

// Function to get user progress for a specific tour
function getUserProgressForSpecificTour(userId, guildId, tourId) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM user_progress WHERE user_id = ? AND guild_id = ? AND tour_id = ?', 
               [userId, guildId, tourId], 
               (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
}

module.exports = {
    db,
    initializeDatabase,
    ensureServerConfig,
    getServerConfig,
    updateServerConfig,
    addTour,
    addDefaultTour,
    getGuildTours,
    getTourDetails,
    findTourByNameOrId,
    deleteTourAndSteps,
    getTourSteps,
    getTourStepById,
    addTourStep,
    editTourStep,
    deleteTourStepAndRenumber,
    getUserProgress,
    getUserProgressForSpecificTour,
    startOrUpdateUserTour,
    updateUserProgress,
    completeUserTour,
    endUserTour,
    updateTourCompletionRole,
    logTourEvent,
    moveTourStep,
    getMaxStepNumber
};