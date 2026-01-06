import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { idDocument, selfie } = await req.json();
    
    if (!idDocument || !selfie) {
      return new Response(
        JSON.stringify({ error: 'Both ID document and selfie are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log('Starting face verification...');

    // Call Lovable AI with vision model to compare faces
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'You are a face verification expert. Compare the faces in these two images and determine if they show the same person. The first image is an ID document and the second is a selfie. Respond with ONLY "MATCH" if the faces clearly belong to the same person, or "NO_MATCH" if they appear to be different people or if you cannot make a confident determination. Consider facial features, bone structure, and key identifying characteristics. Be strict in your assessment for security purposes.'
              },
              {
                type: 'image_url',
                image_url: { url: idDocument }
              },
              {
                type: 'image_url',
                image_url: { url: selfie }
              }
            ]
          }
        ],
        max_tokens: 10
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error('Failed to verify face match');
    }

    const data = await response.json();
    const result = data.choices?.[0]?.message?.content?.trim().toUpperCase();
    
    console.log('Face verification result:', result);

    const isMatch = result === 'MATCH';

    return new Response(
      JSON.stringify({ 
        match: isMatch,
        message: isMatch ? 'Faces match successfully' : 'Faces do not match or could not be verified'
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in verify-face-match function:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        match: false
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
