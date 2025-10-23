import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ArrowLeft,
  Building2,
  Phone,
  Brain,
  CheckCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  Send,
  TestTube
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const IntegrationHub = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  // QuickBooks State
  const [qbClientId, setQbClientId] = useState('');
  const [qbClientSecret, setQbClientSecret] = useState('');
  const [qbRedirectUrl, setQbRedirectUrl] = useState('');
  const [isSavingQbCreds, setIsSavingQbCreds] = useState(false);
  const [isLoadingQbCreds, setIsLoadingQbCreds] = useState(true);
  const [quickbooksConnecting, setQuickbooksConnecting] = useState(false);
  const [quickbooksStatus, setQuickbooksStatus] = useState<{
    connected: boolean;
    realmId?: string;
    connectedAt?: string;
  }>({ connected: false });

  // Twilio State
  const [twilioAccountSid, setTwilioAccountSid] = useState('');
  const [twilioAuthToken, setTwilioAuthToken] = useState('');
  const [twilioPhoneNumber, setTwilioPhoneNumber] = useState('');
  const [testPhoneNumber, setTestPhoneNumber] = useState('');
  const [isSavingTwilio, setIsSavingTwilio] = useState(false);
  const [isLoadingTwilio, setIsLoadingTwilio] = useState(true);
  const [twilioStatus, setTwilioStatus] = useState<'connected' | 'not_connected' | 'error'>('not_connected');
  const [isTestingSms, setIsTestingSms] = useState(false);

  // AI Settings State
  const [aiSettings, setAiSettings] = useState({
    enabled: true,
    primary_model_provider: 'GEMINI',
    fallback_openai_enabled: false,
    fallback_deepseek_claude_enabled: false
  });
  const [isSavingAiSettings, setIsSavingAiSettings] = useState(false);
  const [isLoadingAiSettings, setIsLoadingAiSettings] = useState(true);

  // Error State
  const [lastError, setLastError] = useState<string>('');

  useEffect(() => {
    loadAllCredentials();
    checkQuickBooksConnection();
    loadAiSettings();
  }, []);

  // Refresh QuickBooks connection status when connecting state changes
  useEffect(() => {
    if (!quickbooksConnecting) {
      // Small delay to allow any backend processes to complete
      const timer = setTimeout(() => {
        checkQuickBooksConnection();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [quickbooksConnecting]);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const realmId = searchParams.get('realmId');

    if (code && state && realmId) {
      setQuickbooksConnecting(true);
      const handleCallback = async () => {
        try {
          const { error } = await supabase.functions.invoke('quickbooks-oauth', {
            body: { action: 'callback', code, state, realmId },
          });
          if (error) throw new Error(error.message);
          toast({ title: "Success!", description: "QuickBooks connected successfully." });
          await checkQuickBooksConnection();
        } catch (err: any) {
          console.error('QuickBooks OAuth callback error:', err);
          toast({ title: "Connection Failed", description: err.message || "Could not complete connection.", variant: "destructive" });
        } finally {
          navigate(location.pathname, { replace: true });
          setQuickbooksConnecting(false);
        }
      };
      handleCallback();
    }
  }, [location.search, navigate, toast]);

  const loadAllCredentials = async () => {
    setLastError('');
    
    // Load QuickBooks credentials
    setIsLoadingQbCreds(true);
    try {
      const { data, error } = await supabase.functions.invoke('save-integration-credentials', {
        body: { action: 'get', integration_name: 'quickbooks' },
      });
      
      if (error) {
        console.error('Error loading QuickBooks credentials:', error);
        setLastError(`QuickBooks: ${error.message}`);
      } else if (data && data.success) {
        setQbClientId(data.client_id || '');
        setQbRedirectUrl(data.redirect_url || '');
      }
    } catch (error: any) {
      console.error('Error loading QuickBooks credentials:', error);
      setLastError(`QuickBooks: ${error.message}`);
    } finally {
      setIsLoadingQbCreds(false);
    }

    // Load Twilio credentials
    setIsLoadingTwilio(true);
    try {
      const { data, error } = await supabase.functions.invoke('save-integration-credentials', {
        body: { action: 'get', integration_name: 'twilio' },
      });
      
      if (error) {
        console.error('Error loading Twilio credentials:', error);
        if (!error.message.includes('No credentials found')) {
          setLastError(`Twilio: ${error.message}`);
        }
      } else if (data && data.success && data.twilio_account_sid) {
        setTwilioAccountSid(data.twilio_account_sid);
        setTwilioPhoneNumber(data.twilio_phone_number || '');
        setTwilioStatus('connected');
      }
    } catch (error: any) {
      console.error('Error loading Twilio credentials:', error);
      setLastError(`Twilio: ${error.message}`);
    } finally {
      setIsLoadingTwilio(false);
    }
  };

  const checkQuickBooksConnection = async () => {
    try {
      console.log('Checking QuickBooks connection status...');
      const { data, error } = await supabase
        .from('quickbooks_tokens')
        .select('realm_id, created_at, access_token, expires_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error) {
        console.error('Error checking QuickBooks connection:', error);
        setQuickbooksStatus({ connected: false });
        return;
      }
      
      // Check if we have valid token data
      const hasValidTokenData = !!(data && data.access_token && data.realm_id);
      
      // Check if token is not expired (with 5 minute buffer)
      let isTokenValid = false;
      if (hasValidTokenData && data.expires_at) {
        const expiresAt = new Date(data.expires_at);
        const now = new Date();
        const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
        isTokenValid = expiresAt > fiveMinutesFromNow;
      }
      
      const isConnected = hasValidTokenData && (isTokenValid || !data.expires_at);
      
      console.log('QuickBooks connection check result:', {
        hasValidTokenData,
        isTokenValid,
        isConnected,
        realmId: data?.realm_id,
        expiresAt: data?.expires_at
      });
      
      setQuickbooksStatus({
        connected: isConnected,
        realmId: data?.realm_id,
        connectedAt: data?.created_at
      });
    } catch (error) {
      console.error('Error checking QuickBooks connection:', error);
      setQuickbooksStatus({ connected: false });
    }
  };

  const handleSaveQbCredentials = async () => {
    if (!qbClientId || !qbClientSecret || !qbRedirectUrl) {
      toast({ 
        title: "Missing Fields", 
        description: "Please fill all QuickBooks fields.", 
        variant: "destructive" 
      });
      return;
    }

    setIsSavingQbCreds(true);
    setLastError('');
    
    try {
      const { data, error } = await supabase.functions.invoke('save-integration-credentials', {
        body: {
          action: 'save',
          integration_name: 'quickbooks',
          client_id: qbClientId,
          client_secret: qbClientSecret,
          redirect_url: qbRedirectUrl,
        }
      });

      if (error) {
        console.error('QuickBooks credentials save error:', error);
        // Extract more detailed error information
        const errorMessage = error.context?.error?.message || 
                            error.message || 
                            'Unknown error occurred';
        console.error('Detailed error:', {
          message: error.message,
          context: error.context,
          details: error.details
        });
        setLastError(`QuickBooks: ${errorMessage}`);
        throw new Error(errorMessage);
      }

      if (!data || !data.success) {
        const errorMessage = data?.error || 
                            data?.message || 
                            'Failed to save credentials';
        setLastError(`QuickBooks: ${errorMessage}`);
        throw new Error(errorMessage);
      }

      toast({ 
        title: "Success", 
        description: "QuickBooks credentials saved successfully." 
      });
      
      // Clear the client secret field for security
      setQbClientSecret('');
      
    } catch (error: any) {
      console.error('Error saving QuickBooks credentials:', error);
      toast({ 
        title: "Save Failed", 
        description: `${error.message || 'Failed to save QuickBooks credentials'}. Check console for details.`, 
        variant: "destructive" 
      });
    } finally {
      setIsSavingQbCreds(false);
    }
  };

  const handleSaveTwilioCredentials = async () => {
    if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
      toast({ 
        title: "Missing Fields", 
        description: "Please fill all Twilio fields.", 
        variant: "destructive" 
      });
      return;
    }

    // Validate Twilio Account SID format
    if (!twilioAccountSid.startsWith('AC')) {
      toast({ 
        title: "Invalid Account SID", 
        description: "Twilio Account SID should start with 'AC'", 
        variant: "destructive" 
      });
      return;
    }

    // Validate phone number format
    if (!twilioPhoneNumber.startsWith('+')) {
      toast({ 
        title: "Invalid Phone Number", 
        description: "Twilio phone number should start with '+' and include country code", 
        variant: "destructive" 
      });
      return;
    }

    setIsSavingTwilio(true);
    setLastError('');
    
    try {
      const { data, error } = await supabase.functions.invoke('save-integration-credentials', {
        body: {
          action: 'save',
          integration_name: 'twilio',
          // Set QuickBooks fields to satisfy NOT NULL constraints
          client_id: 'N/A',
          client_secret: 'N/A',
          redirect_url: 'N/A',
          // Twilio-specific fields
          twilio_account_sid: twilioAccountSid,
          twilio_auth_token: twilioAuthToken,
          twilio_phone_number: twilioPhoneNumber,
        },
      });

      if (error) {
        console.error('Twilio credentials save error:', error);
        // Extract more detailed error information
        const errorMessage = error.context?.error?.message || 
                            error.message || 
                            'Unknown error occurred';
        console.error('Detailed error:', {
          message: error.message,
          context: error.context,
          details: error.details
        });
        setLastError(`Twilio: ${errorMessage}`);
        throw new Error(errorMessage);
      }

      if (!data || !data.success) {
        const errorMessage = data?.error || 
                            data?.message || 
                            'Failed to save credentials';
        setLastError(`Twilio: ${errorMessage}`);
        throw new Error(errorMessage);
      }

      toast({ 
        title: "Success", 
        description: "Twilio credentials saved successfully." 
      });
      
      setTwilioStatus('connected');
      // Clear the auth token field for security
      setTwilioAuthToken('');
      
    } catch (error: any) {
      console.error('Error saving Twilio credentials:', error);
      setTwilioStatus('error');
      toast({ 
        title: "Save Failed", 
        description: `${error.message || 'Failed to save Twilio credentials'}. Check console for details.`, 
        variant: "destructive" 
      });
    } finally {
      setIsSavingTwilio(false);
    }
  };

  const handleTestSms = async () => {
    if (twilioStatus !== 'connected') {
      toast({ 
        title: "Not Connected", 
        description: "Please save Twilio credentials first.", 
        variant: "destructive" 
      });
      return;
    }

    if (!testPhoneNumber) {
      toast({
        title: "Missing Phone Number",
        description: "Please enter a phone number to send the test SMS to.",
        variant: "destructive"
      });
      return;
    }

    setIsTestingSms(true);
    setLastError('');
    
    try {
      const { data, error } = await supabase.functions.invoke('send-sms', {
        body: {
          to: testPhoneNumber,
          message: 'Test SMS from LeadSense CRM - Twilio integration is working!',
          type: 'test'
        }
      });

      if (error) {
        console.error('SMS test error:', error);
        const errorMessage = error.message || 'Unknown error occurred';
        setLastError(`SMS Test: ${errorMessage}`);
        throw new Error(errorMessage);
      }

      if (!data || !data.success) {
        const errorMessage = data?.error || 'Failed to send test SMS';
        setLastError(`SMS Test: ${errorMessage}`);
        throw new Error(errorMessage);
      }

      toast({ 
        title: "Test Successful", 
        description: "Test SMS sent successfully! Check your phone." 
      });
      
    } catch (error: any) {
      console.error('Error testing SMS:', error);
      setTwilioStatus('error');
      toast({ 
        title: "Test Failed", 
        description: error.message || 'Failed to send test SMS', 
        variant: "destructive" 
      });
    } finally {
      setIsTestingSms(false);
    }
  };

  const loadAiSettings = async () => {
    setIsLoadingAiSettings(true);
    setLastError('');
    
    try {
      const { data, error } = await supabase
        .from('ai_settings')
        .select('*')
        .limit(1)
        .maybeSingle();
      
      if (error) {
        console.error('Error loading AI settings:', error);
        if (!error.message.includes('No rows found')) {
          setLastError(`AI Settings: ${error.message}`);
        }
      } else if (data) {
        setAiSettings({
          enabled: data.enabled,
          primary_model_provider: data.primary_model_provider,
          fallback_openai_enabled: data.fallback_openai_enabled,
          fallback_deepseek_claude_enabled: data.fallback_deepseek_claude_enabled
        });
      }
    } catch (error: any) {
      console.error('Error loading AI settings:', error);
      setLastError(`AI Settings: ${error.message}`);
    } finally {
      setIsLoadingAiSettings(false);
    }
  };

  const handleSaveAiSettings = async () => {
    // Validation: If AI is enabled, ensure at least one model is selected
    if (aiSettings.enabled) {
      const hasAnyModel = aiSettings.primary_model_provider || 
                         aiSettings.fallback_openai_enabled || 
                         aiSettings.fallback_deepseek_claude_enabled;
      
      if (!hasAnyModel) {
        toast({
          title: "Validation Error",
          description: "When AI is enabled, you must select at least one model (primary or fallback).",
          variant: "destructive",
        });
        return;
      }
    }

    setIsSavingAiSettings(true);
    setLastError('');
    
    try {
      // First, check if settings exist
      const { data: existingSettings } = await supabase
        .from('ai_settings')
        .select('id')
        .limit(1)
        .maybeSingle();

      let result;
      if (existingSettings) {
        // Update existing settings
        result = await supabase
          .from('ai_settings')
          .update({
            enabled: aiSettings.enabled,
            primary_model_provider: aiSettings.primary_model_provider,
            fallback_openai_enabled: aiSettings.fallback_openai_enabled,
            fallback_deepseek_claude_enabled: aiSettings.fallback_deepseek_claude_enabled,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingSettings.id);
      } else {
        // Insert new settings
        result = await supabase
          .from('ai_settings')
          .insert({
            enabled: aiSettings.enabled,
            primary_model_provider: aiSettings.primary_model_provider,
            fallback_openai_enabled: aiSettings.fallback_openai_enabled,
            fallback_deepseek_claude_enabled: aiSettings.fallback_deepseek_claude_enabled
          });
      }

      if (result.error) {
        console.error('AI settings save error:', result.error);
        const errorMessage = result.error.message || 'Unknown error occurred';
        setLastError(`AI Settings: ${errorMessage}`);
        throw new Error(errorMessage);
      }

      toast({
        title: "Success",
        description: "AI settings saved successfully.",
      });
      
    } catch (error: any) {
      console.error('Error saving AI settings:', error);
      toast({
        title: "Save Failed",
        description: `${error.message || 'Failed to save AI settings'}. Check console for details.`,
        variant: "destructive",
      });
    } finally {
      setIsSavingAiSettings(false);
    }
  };

  const handleQuickBooksConnect = async () => {
    if (!qbClientId || !qbRedirectUrl) {
      toast({ 
        title: "Credentials Missing", 
        description: "Please save Client ID and Redirect URL first.", 
        variant: "destructive" 
      });
      return;
    }
    
    setQuickbooksConnecting(true);
    setLastError('');
    
    try {
      const { data, error } = await supabase.functions.invoke('quickbooks-oauth', {
        body: { action: 'initiate' }
      });
      
      if (error) {
        console.error('QuickBooks OAuth initiate error:', error);
        const errorMessage = error.message || 'Unknown error occurred';
        setLastError(`QuickBooks: ${errorMessage}`);
        throw new Error(errorMessage);
      }
      
      if (!data || !data.authUrl) {
        const errorMessage = 'No auth URL received from QuickBooks';
        setLastError(`QuickBooks: ${errorMessage}`);
        throw new Error(errorMessage);
      }
      
      window.location.href = data.authUrl;
    } catch (error: any) {
      console.error('Error initiating QuickBooks OAuth:', error);
      toast({ 
        title: "Connection Error", 
        description: error.message || "Failed to initiate connection.", 
        variant: "destructive" 
      });
      setQuickbooksConnecting(false);
    }
  };

  const handleQuickBooksDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect QuickBooks?')) return;
    
    setLastError('');
    
    try {
      const { data: tokens, error: fetchError } = await supabase
        .from('quickbooks_tokens')
        .select('id')
        .limit(1);
      
      if (fetchError || !tokens || tokens.length === 0) {
        throw new Error("No connection to disconnect.");
      }
      
      const { error } = await supabase
        .from('quickbooks_tokens')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      
      if (error) throw error;
      
      setQuickbooksStatus({ connected: false });
      toast({ title: "Success", description: "QuickBooks disconnected." });
    } catch (error: any) {
      console.error('Error disconnecting QuickBooks:', error);
      setLastError(`QuickBooks: ${error.message}`);
      toast({ 
        title: "Error", 
        description: error.message || "Failed to disconnect.", 
        variant: "destructive" 
      });
    }
  };

  const handleTwilioDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect Twilio SMS?')) return;
    
    setLastError('');
    
    try {
      // Clear Twilio credentials from database
      const { error } = await supabase
        .from('integration_credentials')
        .update({
          twilio_account_sid: null,
          twilio_auth_token: null,
          twilio_phone_number: null,
          updated_at: new Date().toISOString()
        })
        .eq('integration_name', 'twilio');
      
      if (error) throw error;
      
      // Reset state
      setTwilioAccountSid('');
      setTwilioAuthToken('');
      setTwilioPhoneNumber('');
      setTwilioStatus('not_connected');
      
      toast({ title: "Success", description: "Twilio SMS disconnected." });
    } catch (error: any) {
      console.error('Error disconnecting Twilio:', error);
      setLastError(`Twilio: ${error.message}`);
      toast({ 
        title: "Error", 
        description: error.message || "Failed to disconnect.", 
        variant: "destructive" 
      });
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleDateString();
  };

  const getStatusIcon = (connected: boolean, error?: boolean) => {
    if (error) return <AlertCircle className="h-5 w-5 text-red-500" />;
    return connected ? <CheckCircle className="h-5 w-5 text-green-500" /> : <AlertCircle className="h-5 w-5 text-gray-500" />;
  };

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Integration Hub</h1>
          <p className="text-muted-foreground">Connect your CRM with external tools and services</p>
        </div>

        {/* Error Display */}
        {lastError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{lastError}</AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="quickbooks" className="space-y-6">
          <TabsList>
            <TabsTrigger value="quickbooks">QuickBooks</TabsTrigger>
            <TabsTrigger value="twilio">Twilio SMS</TabsTrigger>
            <TabsTrigger value="ai-settings">AI Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="quickbooks" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  QuickBooks Integration
                </CardTitle>
                <CardDescription>
                  Connect to QuickBooks for automated invoicing and customer management.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Connection Status */}
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(quickbooksStatus.connected)}
                    <div>
                      <h4 className="font-medium">
                        {quickbooksStatus.connected ? 'Connected' : 'Not Connected'}
                      </h4>
                      {quickbooksStatus.connected ? (
                        <div className="text-sm text-muted-foreground">
                          <p>Realm ID: {quickbooksStatus.realmId}</p>
                          <p>Connected: {formatDate(quickbooksStatus.connectedAt)}</p>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">Connect to enable invoicing.</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {quickbooksStatus.connected ? (
                      <>
                        <Button variant="outline" size="sm" onClick={checkQuickBooksConnection}>
                          <RefreshCw className="h-4 w-4 mr-1" />
                          Refresh Status
                        </Button>
                        <Button variant="outline" onClick={checkQuickBooksConnection}>
                          <RefreshCw className="h-4 w-4 mr-1" />
                          Refresh
                        </Button>
                        <Button variant="destructive" onClick={handleQuickBooksDisconnect}>
                          Disconnect
                        </Button>
                      </>
                    ) : (
                      <Button 
                        onClick={handleQuickBooksConnect} 
                        disabled={quickbooksConnecting || isLoadingQbCreds}
                      >
                        {quickbooksConnecting ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Connecting...
                          </>
                        ) : (
                          <>
                            <Building2 className="h-4 w-4 mr-2" />
                            Connect to QuickBooks
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>

                <Separator />

                {/* API Credentials */}
                <div>
                  <h4 className="font-medium mb-3">API Credentials</h4>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="qbClientId">QuickBooks Client ID</Label>
                      <Input
                        id="qbClientId"
                        value={qbClientId}
                        onChange={(e) => setQbClientId(e.target.value)}
                        placeholder="Enter Client ID"
                        disabled={isSavingQbCreds || isLoadingQbCreds}
                      />
                    </div>
                    <div>
                      <Label htmlFor="qbClientSecret">QuickBooks Client Secret</Label>
                      <Input
                        id="qbClientSecret"
                        type="password"
                        value={qbClientSecret}
                        onChange={(e) => setQbClientSecret(e.target.value)}
                        placeholder="Enter Client Secret"
                        disabled={isSavingQbCreds || isLoadingQbCreds}
                      />
                    </div>
                    <div>
                      <Label htmlFor="qbRedirectUrl">QuickBooks Redirect URL</Label>
                      <Input
                        id="qbRedirectUrl"
                        value={qbRedirectUrl}
                        onChange={(e) => setQbRedirectUrl(e.target.value)}
                        placeholder="Enter Redirect URL"
                        disabled={isSavingQbCreds || isLoadingQbCreds}
                      />
                    </div>
                    <Button 
                      onClick={handleSaveQbCredentials} 
                      disabled={isSavingQbCreds || isLoadingQbCreds}
                    >
                      {isSavingQbCreds ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        "Save QuickBooks Credentials"
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="twilio" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Phone className="h-5 w-5" />
                  Twilio SMS Integration
                </CardTitle>
                <CardDescription>
                  Configure Twilio to enable SMS messaging from your CRM.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Connection Status */}
                                  <div className="flex items-center justify-between p-4 border rounded-lg">
                                    <div className="flex items-center gap-3">
                                      {getStatusIcon(twilioStatus === 'connected', twilioStatus === 'error')}
                                      <div>
                                        <h4 className="font-medium">
                                          {twilioStatus === 'connected' ? 'Connected' : 
                                           twilioStatus === 'error' ? 'Connection Error' : 'Not Connected'}
                                        </h4>
                                        <p className="text-sm text-muted-foreground">
                                          {twilioStatus === 'connected' 
                                            ? `Using phone number: ${twilioPhoneNumber}` 
                                            : 'Save credentials to connect.'}
                                        </p>
                                      </div>
                                    </div>
                                    {twilioStatus === 'connected' && (
                                      <div className="flex items-center gap-2">
                                        <Input
                                          type="tel"
                                          placeholder="Your Phone (+1...)"
                                          value={testPhoneNumber}
                                          onChange={(e) => setTestPhoneNumber(e.target.value)}
                                          className="w-48"
                                        />
                                        <Button 
                                          variant="outline" 
                                          onClick={handleTestSms}
                                          disabled={isTestingSms || !testPhoneNumber}
                                        >
                                          {isTestingSms ? (
                                            <>
                                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                              Testing...
                                            </>
                                          ) : (
                                            <>
                                              <TestTube className="h-4 w-4 mr-2" />
                                              Test SMS
                                            </>
                                          )}
                                        </Button>
                                        <Button variant="destructive" onClick={handleTwilioDisconnect}>
                                          Disconnect
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                <Separator />

                {/* Twilio Credentials */}
                <div>
                  <h4 className="font-medium mb-3">Twilio Credentials</h4>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="twilioSid">Twilio Account SID</Label>
                      <Input
                        id="twilioSid"
                        value={twilioAccountSid}
                        onChange={(e) => setTwilioAccountSid(e.target.value)}
                        placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                        disabled={isSavingTwilio || isLoadingTwilio}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Find this in your Twilio Console under Account Info
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="twilioToken">Twilio Auth Token</Label>
                      <Input
                        id="twilioToken"
                        type="password"
                        value={twilioAuthToken}
                        onChange={(e) => setTwilioAuthToken(e.target.value)}
                        placeholder="Enter Auth Token to save or update"
                        disabled={isSavingTwilio || isLoadingTwilio}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Find this in your Twilio Console under Account Info (click to reveal)
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="twilioPhone">Twilio Phone Number</Label>
                      <Input
                        id="twilioPhone"
                        value={twilioPhoneNumber}
                        onChange={(e) => setTwilioPhoneNumber(e.target.value)}
                        placeholder="+15017122661"
                        disabled={isSavingTwilio || isLoadingTwilio}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Your Twilio phone number with country code (e.g., +1 for US)
                      </p>
                    </div>
                    <Button 
                      onClick={handleSaveTwilioCredentials} 
                      disabled={isSavingTwilio || isLoadingTwilio}
                    >
                      {isSavingTwilio ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        "Save Twilio Credentials"
                      )}
                    </Button>
                  </div>
                </div>

                <Separator />

                {/* Setup Instructions */}
                <div className="bg-muted/50 p-4 rounded-lg">
                  <h4 className="font-medium mb-2">Setup Instructions</h4>
                  <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>Create a Twilio account at <a href="https://www.twilio.com" target="_blank" className="text-primary hover:underline">twilio.com</a></li>
                    <li>Purchase a phone number in your Twilio Console</li>
                    <li>Copy your Account SID and Auth Token from the Console Dashboard</li>
                    <li>Enter the credentials above and click "Save Twilio Credentials"</li>
                    <li>Use "Test SMS" to verify the integration is working</li>
                  </ol>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ai-settings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5" />
                  AI Configuration
                </CardTitle>
                <CardDescription>
                  Configure AI models for email generation, quote generation, and reply analysis.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* AI Status */}
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(aiSettings.enabled)}
                    <div>
                      <h4 className="font-medium">
                        {aiSettings.enabled ? 'AI Enabled' : 'AI Disabled'}
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {aiSettings.enabled 
                          ? `Primary: ${aiSettings.primary_model_provider}` 
                          : 'All AI features are disabled'}
                      </p>
                    </div>
                  </div>
                  <Badge variant={aiSettings.enabled ? "default" : "secondary"}>
                    {aiSettings.enabled ? 'Active' : 'Inactive'}
                  </Badge>
                </div>

                <Separator />

                {/* Master Kill Switch */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="ai-enabled" className="text-base font-medium">
                        Master AI Kill Switch
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Enable or disable all AI functionality across the system
                      </p>
                    </div>
                    <Switch
                      id="ai-enabled"
                      checked={aiSettings.enabled}
                      onCheckedChange={(checked) => 
                        setAiSettings(prev => ({ ...prev, enabled: checked }))
                      }
                      disabled={isSavingAiSettings || isLoadingAiSettings}
                    />
                  </div>
                </div>

                <Separator />

                {/* Primary Model Selection */}
                <div className="space-y-4">
                  <div>
                    <Label className="text-base font-medium">Primary AI Model</Label>
                    <p className="text-sm text-muted-foreground mb-3">
                      Select the primary AI model for all generation tasks
                    </p>
                    <Select 
                      value={aiSettings.primary_model_provider} 
                      onValueChange={(value) => 
                        setAiSettings(prev => ({ ...prev, primary_model_provider: value }))
                      }
                      disabled={!aiSettings.enabled || isSavingAiSettings || isLoadingAiSettings}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GEMINI">Google Gemini</SelectItem>
                        <SelectItem value="OPENAI">OpenAI GPT</SelectItem>
                        <SelectItem value="DEEPSEEK">DeepSeek</SelectItem>
                        <SelectItem value="CLAUDE">Anthropic Claude</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator />

                {/* Fallback Models */}
                <div className="space-y-4">
                  <div>
                    <Label className="text-base font-medium">Fallback Models</Label>
                    <p className="text-sm text-muted-foreground mb-4">
                      Enable fallback models to use if the primary model fails or hits rate limits
                    </p>
                    
                    <div className="space-y-3">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="fallback-openai"
                          checked={aiSettings.fallback_openai_enabled}
                          onCheckedChange={(checked) => 
                            setAiSettings(prev => ({ ...prev, fallback_openai_enabled: !!checked }))
                          }
                          disabled={!aiSettings.enabled || isSavingAiSettings || isLoadingAiSettings}
                        />
                        <Label htmlFor="fallback-openai" className="text-sm font-medium">
                          Enable OpenAI Fallback
                        </Label>
                      </div>
                      <p className="text-xs text-muted-foreground ml-6">
                        Use OpenAI GPT as the first fallback option
                      </p>
                      
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="fallback-deepseek"
                          checked={aiSettings.fallback_deepseek_claude_enabled}
                          onCheckedChange={(checked) => 
                            setAiSettings(prev => ({ ...prev, fallback_deepseek_claude_enabled: !!checked }))
                          }
                          disabled={!aiSettings.enabled || isSavingAiSettings || isLoadingAiSettings}
                        />
                        <Label htmlFor="fallback-deepseek" className="text-sm font-medium">
                          Enable DeepSeek/Claude Fallback
                        </Label>
                      </div>
                      <p className="text-xs text-muted-foreground ml-6">
                        Use DeepSeek or Claude as the second fallback option
                      </p>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Save Button */}
                <div className="flex justify-end">
                  <Button 
                    onClick={handleSaveAiSettings} 
                    disabled={isSavingAiSettings || isLoadingAiSettings}
                  >
                    {isSavingAiSettings ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save AI Settings"
                    )}
                  </Button>
                </div>

                <Separator />

                {/* Configuration Info */}
                <div className="bg-muted/50 p-4 rounded-lg">
                  <h4 className="font-medium mb-2">AI Model Configuration</h4>
                  <div className="text-sm text-muted-foreground space-y-2">
                    <p><strong>Execution Order:</strong></p>
                    <ol className="list-decimal list-inside space-y-1 ml-2">
                      <li>Primary Model: {aiSettings.primary_model_provider}</li>
                      {aiSettings.fallback_openai_enabled && (
                        <li>Fallback 1: OpenAI GPT (if primary fails)</li>
                      )}
                      {aiSettings.fallback_deepseek_claude_enabled && (
                        <li>Fallback 2: DeepSeek/Claude (if previous attempts fail)</li>
                      )}
                    </ol>
                    <p className="mt-3">
                      <strong>Note:</strong> If the Master Kill Switch is disabled, no AI generation will occur.
                      This is useful during development to avoid rate limits and API costs.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
 
export default IntegrationHub;