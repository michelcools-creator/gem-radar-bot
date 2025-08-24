import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Save, RefreshCw, CheckCircle, Key } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { Link } from 'react-router-dom';
import Navigation from '@/components/Navigation';
import LoadingSpinner from '@/components/LoadingSpinner';

const Settings = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .single();
      
      if (error) throw error;
      return data;
    }
  });

  const [formData, setFormData] = useState({
    weights_json: {},
    hybrid_mode: false,
    allow_domains: [] as string[],
    strategy_version: '1.0',
    chatgpt_pro_api_key: ''
  });

  React.useEffect(() => {
    if (settings) {
      setFormData({
        weights_json: settings.weights_json as any || {},
        hybrid_mode: settings.hybrid_mode || false,
        allow_domains: settings.allow_domains || [],
        strategy_version: settings.strategy_version || '1.0',
        chatgpt_pro_api_key: settings.chatgpt_pro_api_key || ''
      });
    }
  }, [settings]);

  const updateSettings = useMutation({
    mutationFn: async (newSettings: any) => {
      const { error } = await supabase
        .from('settings')
        .update({
          weights_json: newSettings.weights_json,
          hybrid_mode: newSettings.hybrid_mode,
          allow_domains: newSettings.allow_domains,
          strategy_version: newSettings.strategy_version,
          chatgpt_pro_api_key: newSettings.chatgpt_pro_api_key
        })
        .eq('id', 1);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Settings Saved",
        description: "Your configuration has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (error: any) => {
      toast({
        title: "Save Failed",
        description: error.message || "Failed to save settings",
        variant: "destructive",
      });
    }
  });

  const handleWeightChange = (pillar: string, value: string) => {
    const numValue = parseInt(value) || 0;
    setFormData(prev => ({
      ...prev,
        weights_json: {
          ...prev.weights_json,
          [pillar]: numValue
        }
    }));
  };

  const handleDomainsChange = (value: string) => {
    const domains = value.split('\n').filter(d => d.trim());
    setFormData(prev => ({
      ...prev,
      allow_domains: domains
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings.mutate(formData);
  };

  if (isLoading) {
    return (
      <>
        <Navigation />
        <div className="flex items-center justify-center min-h-[80vh] flex-col gap-4">
          <LoadingSpinner size="lg" />
          <p className="text-muted-foreground">Loading settings...</p>
        </div>
      </>
    );
  }

  const weights = formData.weights_json as Record<string, number>;
  const totalWeight = Object.values(weights).reduce((sum, val) => sum + val, 0);

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <Link to="/">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </Link>
        
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground">
            Configure analysis parameters and scoring weights
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* Scoring Weights */}
        <Card>
          <CardHeader>
            <CardTitle>Scoring Weights (Web-Only Mode)</CardTitle>
            <p className="text-sm text-muted-foreground">
              Total should equal 100. Current total: {totalWeight}
            </p>
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg mt-2">
              <p className="text-sm text-blue-800">
                ⚠️ Research tool only - not investment advice. Respects robots.txt and rate limits.
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              <div>
                <Label htmlFor="security_rug_pull">Security & Rug-Pull Detection</Label>
                <Input
                  id="security_rug_pull"
                  type="number"
                  min="0"
                  max="100"
                  value={weights.security_rug_pull || 0}
                  onChange={(e) => handleWeightChange('security_rug_pull', e.target.value)}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Based on claims on site/audit links (not verified)
                </p>
              </div>

              <div>
                <Label htmlFor="tokenomics">Tokenomics</Label>
                <Input
                  id="tokenomics"
                  type="number"
                  min="0"
                  max="100"
                  value={weights.tokenomics || 0}
                  onChange={(e) => handleWeightChange('tokenomics', e.target.value)}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Supply/vesting info from public docs
                </p>
              </div>

              <div>
                <Label htmlFor="team_transparency">Team & Transparency</Label>
                <Input
                  id="team_transparency"
                  type="number"
                  min="0"
                  max="100"
                  value={weights.team_transparency || 0}
                  onChange={(e) => handleWeightChange('team_transparency', e.target.value)}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Doxxed team, bios, LinkedIn/track record
                </p>
              </div>

              <div>
                <Label htmlFor="product_roadmap">Product & Roadmap</Label>
                <Input
                  id="product_roadmap"
                  type="number"
                  min="0"
                  max="100"
                  value={weights.product_roadmap || 0}
                  onChange={(e) => handleWeightChange('product_roadmap', e.target.value)}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Demo/MVP, documentation quality, milestones
                </p>
              </div>

              <div>
                <Label htmlFor="onchain_traction">On-chain Traction</Label>
                <Input
                  id="onchain_traction"
                  type="number"
                  min="0"
                  max="100"
                  value={weights.onchain_traction || 0}
                  onChange={(e) => handleWeightChange('onchain_traction', e.target.value)}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Partners/integrations mentioned publicly
                </p>
              </div>

              <div>
                <Label htmlFor="market_narrative">Market/Narrative Fit</Label>
                <Input
                  id="market_narrative"
                  type="number"
                  min="0"
                  max="100"
                  value={weights.market_narrative || 0}
                  onChange={(e) => handleWeightChange('market_narrative', e.target.value)}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Clear positioning vs competitors
                </p>
              </div>

              <div>
                <Label htmlFor="community">Community</Label>
                <Input
                  id="community"
                  type="number"
                  min="0"
                  max="100"
                  value={weights.community || 0}
                  onChange={(e) => handleWeightChange('community', e.target.value)}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Engagement from publicly visible channels
                </p>
              </div>

            </div>

            {totalWeight !== 100 && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  ⚠️ Warning: Total weights should equal 100. Current total: {totalWeight}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Domain Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Allowed Domains</CardTitle>
            <p className="text-sm text-muted-foreground">
              Domains that are allowed for content fetching (one per line)
            </p>
          </CardHeader>
          <CardContent>
            <Label htmlFor="domains">Allowed Domains</Label>
            <Textarea
              id="domains"
              value={formData.allow_domains.join('\n')}
              onChange={(e) => handleDomainsChange(e.target.value)}
              placeholder="coingecko.com&#10;example.com&#10;github.com"
              className="mt-1 min-h-[100px]"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Only content from these domains will be fetched and analyzed
            </p>
          </CardContent>
        </Card>

        {/* Mode Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Analysis Mode</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="hybrid_mode"
                checked={formData.hybrid_mode}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, hybrid_mode: checked }))}
              />
              <div>
                <Label htmlFor="hybrid_mode" className="cursor-pointer">
                  Hybrid Mode (Use CoinGecko API)
                </Label>
                <p className="text-sm text-muted-foreground">
                  When enabled, uses CoinGecko's official API for discovering new listings instead of web scraping
                </p>
              </div>
            </div>

            <div>
              <Label htmlFor="strategy_version">Strategy Version</Label>
              <Input
                id="strategy_version"
                value={formData.strategy_version}
                onChange={(e) => setFormData(prev => ({ ...prev, strategy_version: e.target.value }))}
                className="mt-1 max-w-xs"
              />
            </div>
          </CardContent>
        </Card>

        {/* API Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>API Configuration</CardTitle>
            <p className="text-sm text-muted-foreground">
              Configure your own API keys for better analysis quality
            </p>
          </CardHeader>
          <CardContent>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Label htmlFor="chatgpt_pro_api_key">ChatGPT Pro API Key (Optional)</Label>
                {settings?.chatgpt_pro_api_key && (
                  <div className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-md text-xs">
                    <CheckCircle className="w-3 h-3" />
                    <span>API Key Configured</span>
                  </div>
                )}
              </div>
              <div className="relative">
                <Input
                  id="chatgpt_pro_api_key"
                  type="password"
                  value={formData.chatgpt_pro_api_key}
                  onChange={(e) => setFormData(prev => ({ ...prev, chatgpt_pro_api_key: e.target.value }))}
                  placeholder={settings?.chatgpt_pro_api_key ? "••••••••••••••••••••••••••••••••" : "sk-proj-..."}
                  className="mt-1 pr-10"
                />
                {settings?.chatgpt_pro_api_key && (
                  <Key className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-green-600" />
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Enter your ChatGPT Pro API key to use GPT-5 for significantly better analysis quality. If not provided, the default OpenAI key will be used with GPT-4o-mini.
              </p>
              {settings?.chatgpt_pro_api_key && (
                <p className="text-sm text-green-600 mt-1 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" />
                  Using GPT-5 for enhanced deep analysis
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={updateSettings.isPending}
            className="min-w-[120px]"
          >
            {updateSettings.isPending ? (
              <RefreshCw className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save Settings
          </Button>
        </div>

      </form>
      </div>
    </div>
  );
};

export default Settings;