const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://hkmvdumvoffkkodxapag.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrbXZkdW12b2Zma2tvZHhhcGFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU3NTg5MTYsImV4cCI6MjA4MTMzNDkxNn0.rWHDKa3pEPwEvT30bQoDtqmqhlWs01fF4mFr23xmTG8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  console.log('Testing Supabase connection...\n');

  // Test 1: Check if products table exists
  console.log('1. Checking products table...');
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('*')
    .limit(1);
  
  if (productsError) {
    console.log('   ❌ Products table error:', productsError.message);
    console.log('   → Table might not exist. You need to run the SQL schema.\n');
  } else {
    console.log('   ✅ Products table exists');
    console.log('   → Found', products?.length || 0, 'products\n');
  }

  // Test 2: Check if payment_methods table exists
  console.log('2. Checking payment_methods table...');
  const { data: payments, error: paymentsError } = await supabase
    .from('payment_methods')
    .select('*');
  
  if (paymentsError) {
    console.log('   ❌ Payment methods table error:', paymentsError.message);
  } else {
    console.log('   ✅ Payment methods table exists');
    console.log('   → Found', payments?.length || 0, 'payment methods\n');
  }

  // Test 3: Check if customer_types table exists
  console.log('3. Checking customer_types table...');
  const { data: customers, error: customersError } = await supabase
    .from('customer_types')
    .select('*');
  
  if (customersError) {
    console.log('   ❌ Customer types table error:', customersError.message);
  } else {
    console.log('   ✅ Customer types table exists');
    console.log('   → Found', customers?.length || 0, 'customer types\n');
  }

  // Test 4: Check if settings table exists
  console.log('4. Checking settings table...');
  const { data: settings, error: settingsError } = await supabase
    .from('settings')
    .select('*');
  
  if (settingsError) {
    console.log('   ❌ Settings table error:', settingsError.message);
  } else {
    console.log('   ✅ Settings table exists');
    console.log('   → Found', settings?.length || 0, 'settings\n');
  }

  // Test 5: Check storage bucket
  console.log('5. Checking product-images storage bucket...');
  const { data: buckets, error: bucketsError } = await supabase
    .storage
    .listBuckets();
  
  if (bucketsError) {
    console.log('   ❌ Storage error:', bucketsError.message);
  } else {
    const hasProductImages = buckets?.some(b => b.name === 'product-images');
    if (hasProductImages) {
      console.log('   ✅ product-images bucket exists\n');
    } else {
      console.log('   ❌ product-images bucket NOT found');
      console.log('   → Available buckets:', buckets?.map(b => b.name).join(', ') || 'none');
      console.log('   → You need to create the bucket in Supabase Storage\n');
    }
  }

  // Summary
  console.log('='.repeat(50));
  const hasErrors = productsError || paymentsError || customersError || settingsError;
  
  if (hasErrors) {
    console.log('\n⚠️  DATABASE TABLES NOT FOUND!');
    console.log('\nYou need to run the SQL schema in Supabase:');
    console.log('1. Go to: https://supabase.com/dashboard/project/hkmvdumvoffkkodxapag/sql');
    console.log('2. Copy the contents of supabase-schema.sql');
    console.log('3. Paste and click "Run"\n');
  } else {
    console.log('\n✅ All database tables exist!');
    console.log('The connection is working properly.\n');
  }
}

testConnection().catch(console.error);


