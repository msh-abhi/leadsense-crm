import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface CompanySettings {
  id?: string;
  company_name: string;
  company_email: string;
  company_phone: string;
  timezone: string;
  currency: string;
}

interface UserProfile {
  id?: string;
  user_id?: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  bio: string;
}

interface NotificationSettings {
  id?: string;
  user_id?: string;
  email_notifications: boolean;
  sms_notifications: boolean;
  new_lead_alerts: boolean;
  follow_up_reminders: boolean;
  payment_notifications: boolean;
  system_alerts: boolean;
}

interface SettingsContextType {
  companySettings: CompanySettings | null;
  userProfile: UserProfile | null;
  notificationSettings: NotificationSettings | null;
  loading: boolean;
  saveCompanySettings: (settings: Partial<CompanySettings>) => Promise<{ error?: any }>;
  saveUserProfile: (profile: Partial<UserProfile>) => Promise<{ error?: any }>;
  saveNotificationSettings: (settings: Partial<NotificationSettings>) => Promise<{ error?: any }>;
  refreshSettings: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadAllSettings();
    }
  }, [user]);

  const loadAllSettings = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadCompanySettings(),
        loadUserProfile(),
        loadNotificationSettings()
      ]);
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCompanySettings = async () => {
    try {
      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error && !error.message.includes('No rows')) {
        throw error;
      }

      if (data) {
        setCompanySettings(data);
      } else {
        // Create default company settings if none exist
        const defaultSettings = {
          company_name: 'Your Client Company Name',
          company_email: 'info@yourclient.com',
          company_phone: '+1 (555) 123-4567',
          timezone: 'America/Los_Angeles',
          currency: 'USD'
        };
        
        const { data: newSettings, error: createError } = await supabase
          .from('company_settings')
          .insert(defaultSettings)
          .select()
          .single();

        if (createError) throw createError;
        setCompanySettings(newSettings);
      }
    } catch (error) {
      console.error('Error loading company settings:', error);
    }
  };

  const loadUserProfile = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && !error.message.includes('No rows')) {
        throw error;
      }

      if (data) {
        setUserProfile(data);
      } else {
        // Create default user profile if none exists
        const defaultProfile = {
          user_id: user.id,
          first_name: user.user_metadata?.first_name || '',
          last_name: user.user_metadata?.last_name || '',
          email: user.email || '',
          role: 'Administrator',
          bio: 'CRM Administrator for LeadSense CRM'
        };
        
        const { data: newProfile, error: createError } = await supabase
          .from('user_profiles')
          .insert(defaultProfile)
          .select()
          .single();

        if (createError) throw createError;
        setUserProfile(newProfile);
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
    }
  };

  const loadNotificationSettings = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('notification_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && !error.message.includes('No rows')) {
        throw error;
      }

      if (data) {
        setNotificationSettings(data);
      } else {
        // Create default notification settings if none exist
        const defaultSettings = {
          user_id: user.id,
          email_notifications: true,
          sms_notifications: false,
          new_lead_alerts: true,
          follow_up_reminders: true,
          payment_notifications: true,
          system_alerts: true
        };
        
        const { data: newSettings, error: createError } = await supabase
          .from('notification_settings')
          .insert(defaultSettings)
          .select()
          .single();

        if (createError) throw createError;
        setNotificationSettings(newSettings);
      }
    } catch (error) {
      console.error('Error loading notification settings:', error);
    }
  };

  const saveCompanySettings = async (settings: Partial<CompanySettings>) => {
    try {
      if (companySettings?.id) {
        // Update existing settings
        const { data, error } = await supabase
          .from('company_settings')
          .update({
            ...settings,
            updated_at: new Date().toISOString()
          })
          .eq('id', companySettings.id)
          .select()
          .single();

        if (error) throw error;
        setCompanySettings(data);
      } else {
        // Create new settings
        const { data, error } = await supabase
          .from('company_settings')
          .insert(settings)
          .select()
          .single();

        if (error) throw error;
        setCompanySettings(data);
      }

      return { error: null };
    } catch (error) {
      console.error('Error saving company settings:', error);
      return { error };
    }
  };

  const saveUserProfile = async (profile: Partial<UserProfile>) => {
    if (!user) return { error: new Error('User not authenticated') };

    try {
      if (userProfile?.id) {
        // Update existing profile
        const { data, error } = await supabase
          .from('user_profiles')
          .update({
            ...profile,
            updated_at: new Date().toISOString()
          })
          .eq('id', userProfile.id)
          .select()
          .single();

        if (error) throw error;
        setUserProfile(data);
      } else {
        // Create new profile
        const { data, error } = await supabase
          .from('user_profiles')
          .insert({
            ...profile,
            user_id: user.id
          })
          .select()
          .single();

        if (error) throw error;
        setUserProfile(data);
      }

      return { error: null };
    } catch (error) {
      console.error('Error saving user profile:', error);
      return { error };
    }
  };

  const saveNotificationSettings = async (settings: Partial<NotificationSettings>) => {
    if (!user) return { error: new Error('User not authenticated') };

    try {
      if (notificationSettings?.id) {
        // Update existing settings
        const { data, error } = await supabase
          .from('notification_settings')
          .update({
            ...settings,
            updated_at: new Date().toISOString()
          })
          .eq('id', notificationSettings.id)
          .select()
          .single();

        if (error) throw error;
        setNotificationSettings(data);
      } else {
        // Create new settings
        const { data, error } = await supabase
          .from('notification_settings')
          .insert({
            ...settings,
            user_id: user.id
          })
          .select()
          .single();

        if (error) throw error;
        setNotificationSettings(data);
      }

      return { error: null };
    } catch (error) {
      console.error('Error saving notification settings:', error);
      return { error };
    }
  };

  const refreshSettings = async () => {
    await loadAllSettings();
  };

  const value = {
    companySettings,
    userProfile,
    notificationSettings,
    loading,
    saveCompanySettings,
    saveUserProfile,
    saveNotificationSettings,
    refreshSettings,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};