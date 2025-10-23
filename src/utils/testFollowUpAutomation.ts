import { supabase } from '@/integrations/supabase/client';

/**
 * Test utility to manually trigger follow-up automation
 * This helps debug why follow-ups aren't working
 */
export async function testFollowUpAutomation() {
  try {
    console.log('🔄 Testing follow-up automation...');
    
    // First, let's check what leads exist and their current state
    const { data: allLeads, error: leadsError } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false });

    if (leadsError) {
      console.error('❌ Error fetching leads:', leadsError);
      return { success: false, error: leadsError.message };
    }

    console.log(`📊 Total leads in database: ${allLeads?.length || 0}`);
    
    // Check leads that should qualify for follow-up
    const fourDaysAgo = new Date();
    fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);
    
    console.log(`📅 Checking for leads with last communication before: ${fourDaysAgo.toISOString()}`);
    
    const qualifyingLeads = allLeads?.filter(lead => {
      const qualifies = 
        lead.reply_detected === false &&
        ['Quote Sent', 'Follow-up Sent 1', 'Follow-up Sent 2', 'Follow-up Sent 3'].includes(lead.status) &&
        lead.last_communication_date &&
        new Date(lead.last_communication_date) < fourDaysAgo &&
        lead.follow_up_count < 4;
      
      if (qualifies) {
        console.log(`✅ Lead ${lead.id} (${lead.director_email}) qualifies:`, {
          status: lead.status,
          reply_detected: lead.reply_detected,
          last_communication_date: lead.last_communication_date,
          follow_up_count: lead.follow_up_count,
          days_since_last_comm: Math.floor((new Date().getTime() - new Date(lead.last_communication_date).getTime()) / (1000 * 60 * 60 * 24))
        });
      }
      
      return qualifies;
    }) || [];

    console.log(`🎯 Leads qualifying for follow-up: ${qualifyingLeads.length}`);
    
    // Now trigger the actual follow-up automation function
    console.log('🚀 Triggering follow-up automation function...');
    
    const { data: automationResult, error: automationError } = await supabase.functions.invoke('follow-up-automation', {
      body: {}
    });

    if (automationError) {
      console.error('❌ Follow-up automation error:', automationError);
      return { success: false, error: automationError.message };
    }

    console.log('✅ Follow-up automation completed:', automationResult);
    
    return {
      success: true,
      totalLeads: allLeads?.length || 0,
      qualifyingLeads: qualifyingLeads.length,
      automationResult
    };
    
  } catch (error: any) {
    console.error('❌ Test function error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Check follow-up templates in the database
 */
export async function checkFollowUpTemplates() {
  try {
    const { data: templates, error } = await supabase
      .from('follow_up_templates')
      .select('*')
      .order('sequence_number', { ascending: true });

    if (error) {
      console.error('❌ Error fetching templates:', error);
      return { success: false, error: error.message };
    }

    console.log('📧 Follow-up templates in database:');
    templates?.forEach(template => {
      console.log(`  - Sequence ${template.sequence_number}: ${template.name} (${template.is_active ? 'Active' : 'Inactive'})`);
    });

    return { success: true, templates };
  } catch (error: any) {
    console.error('❌ Template check error:', error);
    return { success: false, error: error.message };
  }
}