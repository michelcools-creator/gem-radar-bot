import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExternalLink, Shield, Users, Coins, Rocket, TrendingUp, MessageCircle, Network } from 'lucide-react';

interface Claim {
  id: string;
  pillar: 'security' | 'tokenomics' | 'team' | 'product' | 'market' | 'community' | 'traction';
  type: string;
  value: string;
  proof_urls: string[];
  excerpt: string;
  confidence_local: number;
}

interface RedFlag {
  guaranteed_returns?: string[];
  audit_claim_no_source?: boolean;
  suspected_copycat?: {
    brand: string;
    reason: string;
    proof_urls: string[];
  };
  misleading_claims?: Array<{
    claim_id: string;
    reason: string;
  }>;
}

interface EvidenceViewerProps {
  claims: Claim[];
  redFlags: RedFlag;
  contradictions?: Array<{
    claim_ids: string[];
    reason: string;
    proof_urls: string[];
  }>;
  overallCap?: number | null;
}

const getPillarIcon = (pillar: string) => {
  switch (pillar) {
    case 'security': return <Shield className="w-4 h-4" />;
    case 'team': return <Users className="w-4 h-4" />;
    case 'tokenomics': return <Coins className="w-4 h-4" />;
    case 'product': return <Rocket className="w-4 h-4" />;
    case 'market': return <TrendingUp className="w-4 h-4" />;
    case 'community': return <MessageCircle className="w-4 h-4" />;
    case 'traction': return <Network className="w-4 h-4" />;
    default: return null;
  }
};

const getPillarColor = (pillar: string) => {
  const colors = {
    security: 'bg-red-100 text-red-700 border-red-200',
    team: 'bg-blue-100 text-blue-700 border-blue-200', 
    tokenomics: 'bg-green-100 text-green-700 border-green-200',
    product: 'bg-purple-100 text-purple-700 border-purple-200',
    market: 'bg-orange-100 text-orange-700 border-orange-200',
    community: 'bg-pink-100 text-pink-700 border-pink-200',
    traction: 'bg-indigo-100 text-indigo-700 border-indigo-200'
  };
  return colors[pillar as keyof typeof colors] || 'bg-gray-100 text-gray-700 border-gray-200';
};

const getConfidenceColor = (confidence: number) => {
  if (confidence >= 0.8) return 'text-green-600 bg-green-50';
  if (confidence >= 0.6) return 'text-yellow-600 bg-yellow-50';
  return 'text-red-600 bg-red-50';
};

export const EvidenceViewer: React.FC<EvidenceViewerProps> = ({
  claims,
  redFlags,
  contradictions,
  overallCap
}) => {
  const [selectedPillar, setSelectedPillar] = useState<string>('all');
  
  const pillars = ['all', 'security', 'team', 'tokenomics', 'product', 'market', 'community', 'traction'];
  
  const filteredClaims = selectedPillar === 'all' 
    ? claims 
    : claims.filter(claim => claim.pillar === selectedPillar);

  const claimsByPillar = claims.reduce((acc, claim) => {
    if (!acc[claim.pillar]) acc[claim.pillar] = [];
    acc[claim.pillar].push(claim);
    return acc;
  }, {} as Record<string, Claim[]>);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Evidence Viewer 2.0
          {overallCap && (
            <Badge variant="destructive" className="ml-2">
              ⚠️ Score Capped at {overallCap}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={selectedPillar} onValueChange={setSelectedPillar}>
          <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8 mb-4">
            <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
            {pillars.slice(1).map(pillar => (
              <TabsTrigger key={pillar} value={pillar} className="text-xs capitalize">
                <span className="hidden sm:inline">{pillar}</span>
                <span className="sm:hidden">{pillar.slice(0, 3)}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={selectedPillar} className="space-y-4">
            {/* Red Flags Section */}
            {(redFlags.guaranteed_returns?.length > 0 || 
              redFlags.audit_claim_no_source || 
              redFlags.suspected_copycat ||
              redFlags.misleading_claims?.length > 0) && (
              <div className="mb-4">
                <h4 className="font-semibold mb-2 text-red-700">🚨 Red Flags Detected</h4>
                <div className="space-y-2">
                  {redFlags.guaranteed_returns?.map((phrase, i) => (
                    <Badge key={i} variant="destructive" className="mr-2">
                      Guaranteed Returns: "{phrase}"
                    </Badge>
                  ))}
                  
                  {redFlags.audit_claim_no_source && (
                    <Badge variant="destructive" className="mr-2">
                      ⚠️ Audit claim without source
                    </Badge>
                  )}
                  
                  {redFlags.suspected_copycat && (
                    <Badge variant="destructive" className="mr-2">
                      ⚠️ Copycat suspected: {redFlags.suspected_copycat.brand}
                    </Badge>
                  )}
                  
                  {redFlags.misleading_claims?.map((claim, i) => (
                    <Badge key={i} variant="destructive" className="mr-2">
                      ⚠️ Misleading claim detected
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Contradictions Section */}
            {contradictions && contradictions.length > 0 && (
              <div className="mb-4">
                <h4 className="font-semibold mb-2 text-orange-700">⚠️ Contradictions Found</h4>
                <div className="space-y-2">
                  {contradictions.map((contradiction, i) => (
                    <div key={i} className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                      <p className="text-sm text-orange-800 mb-2">{contradiction.reason}</p>
                      <div className="flex gap-2">
                        {contradiction.proof_urls.map((url, j) => (
                          <Button
                            key={j}
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(url, '_blank')}
                            className="text-xs"
                          >
                            <ExternalLink className="w-3 h-3 mr-1" />
                            Source {j + 1}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Claims Section */}
            <div className="space-y-4">
              {selectedPillar === 'all' ? (
                Object.entries(claimsByPillar).map(([pillar, pillarClaims]) => (
                  <div key={pillar}>
                    <h4 className="font-semibold mb-3 flex items-center gap-2 capitalize">
                      {getPillarIcon(pillar)}
                      {pillar} ({pillarClaims.length} claims)
                    </h4>
                    <div className="grid gap-3 ml-6">
                      {pillarClaims.map((claim) => (
                        <ClaimCard key={claim.id} claim={claim} />
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="grid gap-3">
                  {filteredClaims.map((claim) => (
                    <ClaimCard key={claim.id} claim={claim} />
                  ))}
                </div>
              )}
              
              {filteredClaims.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No claims found for {selectedPillar === 'all' ? 'any pillar' : selectedPillar}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

const ClaimCard: React.FC<{ claim: Claim }> = ({ claim }) => {
  return (
    <div className="border rounded-lg p-4 bg-white hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <Badge className={getPillarColor(claim.pillar)}>
            {getPillarIcon(claim.pillar)}
            <span className="ml-1 capitalize">{claim.pillar}</span>
          </Badge>
          <Badge variant="outline" className="text-xs">
            {claim.type}
          </Badge>
        </div>
        <Badge 
          variant="outline" 
          className={`text-xs ${getConfidenceColor(claim.confidence_local)}`}
        >
          {Math.round(claim.confidence_local * 100)}%
        </Badge>
      </div>
      
      <p className="font-medium text-gray-900 mb-2">{claim.value}</p>
      
      {claim.excerpt && (
        <div className="mb-3">
          <p className="text-sm text-gray-600 bg-gray-50 p-2 rounded italic">
            "{claim.excerpt}"
          </p>
        </div>
      )}
      
      <div className="flex flex-wrap gap-2">
        {claim.proof_urls.map((url, i) => (
          <Button
            key={i}
            variant="outline"
            size="sm"
            onClick={() => window.open(url, '_blank')}
            className="text-xs h-7"
          >
            <ExternalLink className="w-3 h-3 mr-1" />
            Source {i + 1}
          </Button>
        ))}
      </div>
    </div>
  );
};