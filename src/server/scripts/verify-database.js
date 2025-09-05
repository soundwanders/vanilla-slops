// src/server/scripts/verify-database.js
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL, 
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyDatabase() {
  console.log('Verifying Vanilla Slops database structure and data...\n');
  
  try {
    // Check Supabase connection
    console.log('🔌 Testing Supabase connection...');
    const { data, error } = await supabase.from('games').select('count').limit(1);
    if (error) {
      console.log(`❌ Connection failed: ${error.message}`);
      return;
    }
    console.log('✅ Supabase connection successful\n');
    
    // 1. Check games table
    console.log('📋 Checking GAMES table...');
    const { data: games, error: gamesError, count: gamesCount } = await supabase
      .from('games')
      .select('app_id, title, developer, total_options_count', { count: 'exact' })
      .limit(3);
    
    if (gamesError) {
      console.log(`   ❌ Error: ${gamesError.message}`);
    } else {
      console.log(`   ✅ Found ${gamesCount} total games`);
      console.log(`   📝 Sample games:`, games?.map(g => `${g.app_id}: ${g.title} (${g.total_options_count || 0} options)`));
    }
    
    // 2. Check game_launch_options junction table
    console.log('\n🔗 Checking GAME_LAUNCH_OPTIONS junction table...');
    const { data: junctions, error: junctionError, count: junctionCount } = await supabase
      .from('game_launch_options')
      .select('game_app_id, launch_option_id', { count: 'exact' })
      .limit(5);
    
    if (junctionError) {
      console.log(`   ❌ Error: ${junctionError.message}`);
      console.log(`   💡 This table links games to their launch options`);
    } else {
      console.log(`   ✅ Found ${junctionCount} total game-option relationships`);
      console.log(`   📝 Sample relationships:`, junctions?.map(j => `Game ${j.game_app_id} → Option ${j.launch_option_id}`));
    }
    
    // 3. Check launch_options table
    console.log('\n🐸 Checking LAUNCH_OPTIONS table...');
    const { data: options, error: optionsError, count: optionsCount } = await supabase
      .from('launch_options')
      .select('id, command, description, source, upvotes', { count: 'exact' })
      .limit(3);
    
    if (optionsError) {
      console.log(`   ❌ Error: ${optionsError.message}`);
      console.log(`   💡 This table contains the actual launch option commands`);
    } else {
      console.log(`   ✅ Found ${optionsCount} total launch options`);
      console.log(`   📝 Sample options:`, options?.map(o => `${o.command}: ${o.description?.substring(0, 50)}...`));
    }
    
    // 4. Test a specific game's launch options flow
    if (games?.length > 0 && !junctionError && !optionsError) {
      console.log('\n🧪 Testing launch options flow for a sample game...');
      const testGame = games.find(g => g.total_options_count > 0) || games[0];
      const testGameId = testGame.app_id;
      
      console.log(`   Testing with: ${testGame.title} (ID: ${testGameId})`);
      
      // Step 1: Get junction data
      const { data: testJunctions, error: testJunctionError } = await supabase
        .from('game_launch_options')
        .select('launch_option_id')
        .eq('game_app_id', testGameId);
      
      if (testJunctionError) {
        console.log(`   ❌ Junction lookup failed: ${testJunctionError.message}`);
      } else {
        console.log(`   🔗 Found ${testJunctions?.length || 0} option IDs for this game`);
        
        if (testJunctions?.length > 0) {
          const optionIds = testJunctions.map(j => j.launch_option_id);
          console.log(`   🍓 Option IDs: ${optionIds.join(', ')}`);
          
          // Step 2: Get actual options
          const { data: testOptions, error: testOptionsError } = await supabase
            .from('launch_options')
            .select('id, command, description')
            .in('id', optionIds);
          
          if (testOptionsError) {
            console.log(`   ❌ Options lookup failed: ${testOptionsError.message}`);
          } else {
            console.log(`   ✅ Successfully retrieved ${testOptions?.length || 0} launch options`);
            testOptions?.forEach(opt => {
              console.log(`      • ${opt.command}: ${opt.description || 'No description'}`);
            });
          }
        }
      }
    }
    
    // 5. Summary and recommendations
    console.log('\n📊 VERIFICATION SUMMARY:');
    console.log('================================');
    
    if (gamesError) {
      console.log('❌ CRITICAL: Cannot access games table');
    } else if (gamesCount === 0) {
      console.log('⚠️  WARNING: Games table is empty');
    } else {
      console.log(`✅ Games table: ${gamesCount} games available`);
    }
    
    if (junctionError) {
      console.log('❌ CRITICAL: game_launch_options table missing or inaccessible');
      console.log('   💡 This is likely why launch options aren\'t loading!');
      console.log('   🔧 Need to create this junction table');
    } else if (junctionCount === 0) {
      console.log('⚠️  WARNING: No game-option relationships exist');
      console.log('   💡 Launch options won\'t show until this is populated');
    } else {
      console.log(`✅ Junction table: ${junctionCount} relationships`);
    }
    
    if (optionsError) {
      console.log('❌ CRITICAL: launch_options table missing or inaccessible');
      console.log('   💡 Need to create this table for launch options');
    } else if (optionsCount === 0) {
      console.log('⚠️  WARNING: No launch options exist in database');
      console.log('   💡 Need to populate with launch option data');
    } else {
      console.log(`✅ Launch options: ${optionsCount} available`);
    }
    
    // Provide next steps
    console.log('\n🐸 NEXT STEPS:');
    if (junctionError || optionsError) {
      console.log('1. Create missing database tables');
      console.log('2. Set up proper table relationships');
      console.log('3. Populate with sample data');
    } else if (junctionCount === 0 || optionsCount === 0) {
      console.log('1. Populate database with launch options data');
      console.log('2. Create game-option relationships');
    } else {
      console.log('✅ Database structure looks good!');
      console.log('💡 If launch options still don\'t load, check:');
      console.log('   - Frontend/backend port configuration');
      console.log('   - CORS settings');
      console.log('   - Browser console for errors');
    }
    
  } catch (error) {
    console.error('💥 Database verification failed:', error.message);
    console.error('🔍 Full error:', error);
  }
}

// Run verification
verifyDatabase();